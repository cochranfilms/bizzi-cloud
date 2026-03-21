/**
 * POST /api/admin/enterprise/organizations/[orgId]/update-subscription
 * Admin-only: Update org storage and add-ons with prorated invoice.
 * Charges the organization's card on file immediately for the prorated difference.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import { getOrCreateStripeAddonPrice } from "@/lib/stripe-prices";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import Stripe from "stripe";
import type { AddonId } from "@/lib/plan-constants";

const TB = 1024 * 1024 * 1024 * 1024;
const MIN_STORAGE_TB = 20;
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"] as const;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;

  let body: {
    storage_tb?: number;
    storage_price_monthly?: number;
    addon_ids?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const storageTb =
    typeof body.storage_tb === "number" && body.storage_tb >= MIN_STORAGE_TB
      ? Math.floor(body.storage_tb)
      : null;
  const storagePriceMonthly =
    typeof body.storage_price_monthly === "number" && body.storage_price_monthly > 0
      ? body.storage_price_monthly
      : null;

  const rawAddonIds = Array.isArray(body.addon_ids)
    ? body.addon_ids.filter((id): id is AddonId =>
        typeof id === "string" && VALID_ADDON_IDS.includes(id as (typeof VALID_ADDON_IDS)[number])
      )
    : [];
  const addonIds: AddonId[] =
    rawAddonIds.includes("fullframe")
      ? ["fullframe"]
      : (rawAddonIds as AddonId[]);

  if (storageTb === null && storagePriceMonthly === null && addonIds.length === 0) {
    return NextResponse.json(
      { error: "Provide at least one of: storage_tb, storage_price_monthly, addon_ids" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  if (!orgSnap.exists) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const orgData = orgSnap.data()!;
  const subId = orgData.stripe_subscription_id as string | undefined;
  if (!subId) {
    return NextResponse.json(
      { error: "Organization has no active Stripe subscription" },
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
    console.error("[update-subscription] Failed to retrieve subscription:", err);
    return NextResponse.json(
      { error: "Failed to load subscription" },
      { status: 500 }
    );
  }

  const items = subscription.items.data;
  let storageItem: Stripe.SubscriptionItem | null = null;
  const addonItems: Stripe.SubscriptionItem[] = [];

  for (const item of items) {
    if (item.deleted) continue;
    const price = item.price as Stripe.Price;
    const product = price.product as Stripe.Product;
    const prodMeta = (product as { metadata?: Record<string, string> })?.metadata ?? {};
    const priceMeta = (price as { metadata?: Record<string, string> })?.metadata ?? {};
    const addonId = priceMeta.addon_id;
    const isOrgStorage =
      prodMeta.organization_id === orgId ||
      (typeof (product as { name?: string })?.name === "string" &&
        (product as { name: string }).name.startsWith("Enterprise Storage"));

    if (isOrgStorage) {
      storageItem = item;
    } else if (addonId && VALID_ADDON_IDS.includes(addonId as AddonId)) {
      addonItems.push(item);
    }
  }

  const itemsToUpdate: Stripe.SubscriptionUpdateParams.Item[] = [];

  const currentStorageQuota = orgData.storage_quota_bytes as number | null;
  const currentStorageTb =
    typeof currentStorageQuota === "number" ? Math.round(currentStorageQuota / TB) : MIN_STORAGE_TB;

  if (storageItem && (storageTb !== null || storagePriceMonthly !== null)) {
    const newTb = storageTb ?? currentStorageTb;
    const newPrice = storagePriceMonthly ?? (storageItem.price.unit_amount ?? 0) / 100;

    if (newTb < MIN_STORAGE_TB) {
      return NextResponse.json(
        { error: `Storage must be at least ${MIN_STORAGE_TB} TB` },
        { status: 400 }
      );
    }

    const product = await stripe.products.create({
      name: `Enterprise Storage ${newTb} TB`,
      metadata: { organization_id: orgId, storage_tb: String(newTb) },
    });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(newPrice * 100),
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { organization_id: orgId, storage_tb: String(newTb) },
    });

    itemsToUpdate.push({ id: storageItem.id, deleted: true });
    itemsToUpdate.push({ price: price.id, quantity: 1 });
  }

  const currentAddonIds = new Set(
    addonItems
      .map((i) => (i.price as Stripe.Price).metadata?.addon_id as string)
      .filter(Boolean)
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
    return NextResponse.json({
      ok: true,
      message: "No changes to apply",
    });
  }

  try {
    await stripe.subscriptions.update(subId, {
      items: itemsToUpdate,
      proration_behavior: "always_invoice",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Update failed";
    console.error("[update-subscription]", err);
    return NextResponse.json(
      {
        error:
          msg.includes("payment") || msg.includes("card")
            ? "Payment failed. Ask the organization to update their payment method."
            : msg,
      },
      { status: 400 }
    );
  }

  const storageQuotaBytes =
    storageTb !== null ? storageTb * TB : orgData.storage_quota_bytes;
  const updateData: Record<string, unknown> = {};
  if (storageTb !== null && typeof storageQuotaBytes === "number") {
    updateData.storage_quota_bytes = storageQuotaBytes;
  }
  if (addonIds.length > 0 || itemsToUpdate.some((i) => "deleted" in i && i.deleted)) {
    updateData.addon_ids = addonIds;
  }

  if (Object.keys(updateData).length > 0) {
    await db.collection("organizations").doc(orgId).update({
      ...updateData,
      updated_at: FieldValue.serverTimestamp(),
    });
  }

  return NextResponse.json({
    ok: true,
    message: "Subscription updated. Prorated invoice has been charged.",
  });
}
