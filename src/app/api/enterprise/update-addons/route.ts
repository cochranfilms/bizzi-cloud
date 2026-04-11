/**
 * POST /api/enterprise/update-addons
 * Organization admins: add or change Power Ups on the org Stripe subscription (prorated).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { getStripeInstance } from "@/lib/stripe";
import { getOrCreateStripeAddonPrice } from "@/lib/stripe-prices";
import { ensureDefaultDrivesForOrgUser } from "@/lib/ensure-default-drives";
import { getOrganizationActiveMemberUserIds } from "@/lib/notification-service";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import type { AddonId } from "@/lib/plan-constants";

const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"] as const;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  let body: { addon_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const orgId = profileSnap.data()?.organization_id as string | undefined;
  if (!orgId) {
    return NextResponse.json({ error: "Not an organization member" }, { status: 403 });
  }

  const access = await resolveEnterpriseAccess(uid, orgId);
  if (!access.isAdmin) {
    return NextResponse.json(
      { error: "Only organization admins can update power ups" },
      { status: 403 }
    );
  }

  const rawAddonIds = Array.isArray(body.addon_ids)
    ? body.addon_ids.filter((id): id is AddonId =>
        typeof id === "string" && VALID_ADDON_IDS.includes(id as (typeof VALID_ADDON_IDS)[number])
      )
    : [];
  const addonIds: AddonId[] = rawAddonIds.includes("fullframe")
    ? ["fullframe"]
    : (rawAddonIds as AddonId[]);

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const orgData = orgSnap.data()!;
  const subId = orgData.stripe_subscription_id as string | undefined;
  if (!subId) {
    return NextResponse.json(
      { error: "Organization has no Stripe subscription. Contact sales to add billing." },
      { status: 400 }
    );
  }

  if (orgData.removal_requested_at) {
    return NextResponse.json(
      { error: "Cannot update subscription for organization pending removal" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(subId, {
      expand: ["items.data.price", "items.data.price.product"],
    });
  } catch (err) {
    console.error("[enterprise/update-addons] retrieve subscription:", err);
    return NextResponse.json({ error: "Failed to load subscription" }, { status: 500 });
  }

  const items = subscription.items.data;
  const addonItems: Stripe.SubscriptionItem[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    const price = item.price as Stripe.Price;
    const addonId = price.metadata?.addon_id;
    if (addonId && VALID_ADDON_IDS.includes(addonId as (typeof VALID_ADDON_IDS)[number])) {
      addonItems.push(item);
    }
  }

  const itemsToUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];
  const currentAddonIds = new Set(
    addonItems.map((i) => (i.price as Stripe.Price).metadata?.addon_id as string).filter(Boolean)
  );
  const targetAddonSet = new Set(addonIds);

  for (const item of addonItems) {
    const addonId = (item.price as Stripe.Price).metadata?.addon_id as string | undefined;
    if (addonId && !targetAddonSet.has(addonId as AddonId)) {
      itemsToUpdate.push({ id: item.id, deleted: true });
    }
  }
  for (const addonId of targetAddonSet) {
    if (!currentAddonIds.has(addonId)) {
      const priceId = await getOrCreateStripeAddonPrice(addonId as AddonId);
      itemsToUpdate.push({ price: priceId, quantity: 1 });
    }
  }

  if (itemsToUpdate.length === 0) {
    return NextResponse.json({ ok: true, message: "No changes to apply" });
  }

  try {
    await stripe.subscriptions.update(subId, {
      items: itemsToUpdate,
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[enterprise/update-addons]", err);
    const paymentIssue =
      msg.includes("payment") ||
      msg.includes("card") ||
      msg.includes("Your card");
    return NextResponse.json(
      {
        error: paymentIssue
          ? "Payment failed. Update your payment method in the billing portal, then try again."
          : msg,
        billing_error: paymentIssue ? "payment_method" : undefined,
      },
      { status: 400 }
    );
  }

  await db.collection("organizations").doc(orgId).update({
    addon_ids: addonIds,
    updated_at: FieldValue.serverTimestamp(),
  });

  const memberUids = await getOrganizationActiveMemberUserIds(db, orgId);
  await Promise.all(
    memberUids.map((memberUid) =>
      ensureDefaultDrivesForOrgUser(memberUid, orgId, addonIds as string[]).catch((err) =>
        console.error("[enterprise/update-addons] ensure drives:", memberUid, err)
      )
    )
  );

  return NextResponse.json({
    ok: true,
    message: "Power ups updated. Any prorated charge appears on your next invoice.",
  });
}
