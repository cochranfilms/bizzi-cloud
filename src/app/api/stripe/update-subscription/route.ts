import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import Stripe from "stripe";
import { NextResponse } from "next/server";

const VALID_PLAN_IDS = ["solo", "indie", "video", "production"];
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"];

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & {
  price: Stripe.Price;
};

function isPlanItem(item: SubscriptionItemWithPrice): boolean {
  const meta = item.price?.metadata;
  if (meta?.addon_id) return false;
  if (meta?.plan_id) return true;
  const interval = item.price?.recurring?.interval;
  return interval === "month" || interval === "year";
}

function isAddonItem(item: SubscriptionItemWithPrice): boolean {
  return !!item.price?.metadata?.addon_id;
}

function getAddonIdFromItem(item: SubscriptionItemWithPrice): string | null {
  const id = item.price?.metadata?.addon_id;
  return typeof id === "string" && VALID_ADDON_IDS.includes(id) ? id : null;
}

/**
 * Update an existing Stripe subscription (plan and/or addons).
 * Requires existing stripe_subscription_id on profile.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let body: { planId?: string; addonIds?: string[]; billing?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const planId = body.planId as PlanId | undefined;
  const addonIdsRaw = Array.isArray(body.addonIds) ? body.addonIds : [];
  const addonIds = addonIdsRaw.filter(
    (id): id is AddonId => typeof id === "string" && VALID_ADDON_IDS.includes(id)
  );
  const billing = (body.billing === "annual" ? "annual" : "monthly") as BillingCycle;

  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profile = profileSnap.data();
  const stripeSubscriptionId = profile?.stripe_subscription_id as string | undefined;

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription. Sync from Stripe or upgrade first." },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();

  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ["items.data.price"],
    });
  } catch (err) {
    console.error("[Stripe update-subscription] Failed to retrieve:", err);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  const items = subscription.items.data as SubscriptionItemWithPrice[];
  let planItem: SubscriptionItemWithPrice | null = null;
  const addonItems: SubscriptionItemWithPrice[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    if (isAddonItem(item)) {
      addonItems.push(item);
    } else if (isPlanItem(item)) {
      planItem = item;
    }
  }

  if (!planItem) {
    return NextResponse.json(
      { error: "Could not identify plan in subscription" },
      { status: 500 }
    );
  }

  const currentBilling: BillingCycle =
    planItem.price?.recurring?.interval === "year" ? "annual" : "monthly";
  const billingToUse = billing || currentBilling;

  const newPlanPriceId = await getOrCreateStripePrice(
    planId as Exclude<PlanId, "free">,
    billingToUse
  );

  const itemsToUpdate: Stripe.SubscriptionUpdateParams.Item[] = [
    { id: planItem.id, price: newPlanPriceId },
  ];

  const existingAddonIds = new Set(
    addonItems.map(getAddonIdFromItem).filter((id): id is string => Boolean(id))
  );
  const targetAddonIds = new Set(addonIds);

  for (const item of addonItems) {
    const addonId = getAddonIdFromItem(item);
    if (!addonId) continue;
    if (targetAddonIds.has(addonId as AddonId)) {
      itemsToUpdate.push({ id: item.id });
    } else {
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
  }

  for (const addonId of targetAddonIds) {
    if (!existingAddonIds.has(addonId)) {
      const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
      itemsToUpdate.push({ price: addonPriceId, quantity: 1 });
    }
  }

  try {
    await stripe.subscriptions.update(stripeSubscriptionId, {
      items: itemsToUpdate,
      metadata: {
        userId: uid,
        planId,
        addonIds: addonIds.join(","),
        billing: billingToUse,
      },
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[Stripe update-subscription]", err);
    return NextResponse.json(
      { error: msg.includes("payment") ? "Payment failed. Check your payment method." : msg },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
