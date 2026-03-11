/**
 * Update existing Stripe subscription with proration.
 * Applies credit for unused time on current plan/addons and charges only the difference.
 */
import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
  getOrCreateStripeStorageAddonPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import type { StorageAddonId } from "@/lib/pricing-data";
import { VALID_STORAGE_ADDON_IDS } from "@/lib/pricing-data";
import Stripe from "stripe";
import { NextResponse } from "next/server";

const VALID_PLAN_IDS = ["solo", "indie", "video", "production"];
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"];
const STORAGE_ADDON_PLAN_MAP: Record<string, "indie" | "video"> = {
  indie_1: "indie", indie_2: "indie", indie_3: "indie",
  video_1: "video", video_2: "video", video_3: "video", video_4: "video", video_5: "video",
};

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & {
  price: Stripe.Price;
};

function isAddonItem(item: SubscriptionItemWithPrice): boolean {
  return !!item.price?.metadata?.addon_id;
}

function getAddonIdFromItem(item: SubscriptionItemWithPrice): string | null {
  const id = item.price?.metadata?.addon_id;
  return typeof id === "string" && VALID_ADDON_IDS.includes(id) ? id : null;
}

function isStorageAddonItem(item: SubscriptionItemWithPrice): boolean {
  return !!item.price?.metadata?.storage_addon_plan;
}

function getStorageAddonIdFromItem(item: SubscriptionItemWithPrice): string | null {
  const id = item.price?.metadata?.storage_addon_id;
  return typeof id === "string" && VALID_STORAGE_ADDON_IDS.includes(id as StorageAddonId) ? id : null;
}

function isPlanItem(item: SubscriptionItemWithPrice): boolean {
  const meta = item.price?.metadata;
  if (meta?.addon_id) return false;
  if (meta?.storage_addon_plan) return false;
  if (meta?.plan_id) return true;
  const interval = item.price?.recurring?.interval;
  return interval === "month" || interval === "year";
}

export type UpdateSubscriptionInput = {
  uid: string;
  planId: string;
  addonIds: AddonId[];
  billing: BillingCycle;
  storageAddonId?: string | null;
};

export async function updateSubscriptionWithProration(
  input: UpdateSubscriptionInput
): Promise<NextResponse> {
  const { uid, planId, addonIds, storageAddonId } = input;

  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profile = profileSnap.data();
  const rawSub = profile?.stripe_subscription_id;
  const stripeSubscriptionId =
    typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id ?? undefined;

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
      { error: "Failed to load subscription", code: "SUBSCRIPTION_LOAD_FAILED" },
      { status: 500 }
    );
  }

  const items = subscription.items.data as SubscriptionItemWithPrice[];
  let planItem: SubscriptionItemWithPrice | null = null;
  const addonItems: SubscriptionItemWithPrice[] = [];
  const storageAddonItems: SubscriptionItemWithPrice[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    if (isAddonItem(item)) {
      addonItems.push(item);
    } else if (isStorageAddonItem(item)) {
      storageAddonItems.push(item);
    } else if (isPlanItem(item)) {
      planItem = item;
    }
  }

  if (!planItem) {
    return NextResponse.json(
      { error: "Could not identify plan in subscription", code: "PLAN_NOT_FOUND" },
      { status: 500 }
    );
  }

  const currentBilling: BillingCycle =
    planItem.price?.recurring?.interval === "year" ? "annual" : "monthly";
  const billingToUse = input.billing || currentBilling;

  let newPlanPriceId: string;
  try {
    newPlanPriceId = await getOrCreateStripePrice(
      planId as Exclude<PlanId, "free">,
      billingToUse
    );
  } catch (err) {
    console.error("[Stripe update-subscription] Failed to get plan price:", err);
    return NextResponse.json(
      { error: "Failed to update. Please try again.", code: "PLAN_PRICE_FAILED" },
      { status: 500 }
    );
  }

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
      try {
        const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
        itemsToUpdate.push({ price: addonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe update-subscription] Failed to get addon price:", err);
        return NextResponse.json(
          { error: "Failed to update. Please try again.", code: "ADDON_PRICE_FAILED" },
          { status: 500 }
        );
      }
    }
  }

  const targetStorageAddonId =
    (planId === "indie" || planId === "video") && storageAddonId && VALID_STORAGE_ADDON_IDS.includes(storageAddonId as StorageAddonId)
      ? (STORAGE_ADDON_PLAN_MAP[storageAddonId] === planId ? storageAddonId : null)
      : null;

  const currentStorageAddonId =
    storageAddonItems.length > 0 ? getStorageAddonIdFromItem(storageAddonItems[0]) : null;
  if (currentStorageAddonId !== targetStorageAddonId) {
    for (const item of storageAddonItems) {
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
    if (targetStorageAddonId) {
      try {
        const storageAddonPriceId = await getOrCreateStripeStorageAddonPrice(targetStorageAddonId as StorageAddonId);
        itemsToUpdate.push({ price: storageAddonPriceId, quantity: 1 });
      } catch (err) {
        console.error("[Stripe update-subscription] Failed to get storage addon price:", err);
        return NextResponse.json(
          { error: "Failed to update. Please try again.", code: "STORAGE_ADDON_PRICE_FAILED" },
          { status: 500 }
        );
      }
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
        ...(targetStorageAddonId ? { storageAddonId: targetStorageAddonId } : {}),
      },
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[Stripe update-subscription]", err);
    return NextResponse.json(
      {
        error: msg.includes("payment")
          ? "Payment failed. Update your payment method in billing settings and try again."
          : msg,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
