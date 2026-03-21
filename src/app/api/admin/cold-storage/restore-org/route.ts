/**
 * POST /api/admin/cold-storage/restore-org
 * Admin-only: Create a new Stripe subscription for an org in cold storage.
 * Returns hosted invoice URL; when owner pays, invoice.paid webhook restores cold storage to hot.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripeSeatPrice,
  getOrCreateStripeAddonPrice,
} from "@/lib/stripe-prices";
import type { AddonId } from "@/lib/plan-constants";
import { hasColdStorage } from "@/lib/cold-storage-restore";
import { getStoragePriceMonthly } from "@/lib/enterprise-pricing";
import { NextResponse } from "next/server";
import Stripe from "stripe";

const TB = 1024 * 1024 * 1024 * 1024;
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"] as const;

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { orgId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : "";
  if (!orgId) {
    return NextResponse.json(
      { error: "orgId is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();

  if (!orgSnap.exists || !orgData) {
    return NextResponse.json(
      { error: "Organization not found" },
      { status: 404 }
    );
  }

  const status = orgData.status as string | undefined;
  if (status !== "cold_storage") {
    return NextResponse.json(
      { error: "Organization is not in cold storage. Only orgs in cold storage can be restored." },
      { status: 400 }
    );
  }

  const stripeCustomerId = orgData.stripe_customer_id as string | undefined;
  if (!stripeCustomerId) {
    return NextResponse.json(
      { error: "Organization has no Stripe customer ID. Cannot create subscription." },
      { status: 400 }
    );
  }

  const hasCold = await hasColdStorage({ orgId });
  if (!hasCold) {
    return NextResponse.json(
      { error: "No cold storage files found for this organization." },
      { status: 400 }
    );
  }

  const storageQuotaBytes = typeof orgData.storage_quota_bytes === "number"
    ? orgData.storage_quota_bytes
    : 20 * TB;
  const storageTb = Math.max(20, Math.floor(storageQuotaBytes / TB));
  const maxSeats = typeof orgData.max_seats === "number" ? orgData.max_seats : 5;
  const addonIds = Array.isArray(orgData.addon_ids)
    ? (orgData.addon_ids as string[]).filter((id): id is AddonId =>
        typeof id === "string" && VALID_ADDON_IDS.includes(id as (typeof VALID_ADDON_IDS)[number])
      )
    : [];
  const normalizedAddons: AddonId[] =
    addonIds.includes("fullframe") ? ["fullframe"] : addonIds;

  const storagePriceMonthly = getStoragePriceMonthly(storageQuotaBytes);

  const stripe = getStripeInstance();
  const seatPriceId = await getOrCreateStripeSeatPrice();

  const storageProduct = await stripe.products.create({
    name: `Enterprise Storage ${storageTb} TB`,
    metadata: { organization_id: orgId, storage_tb: String(storageTb) },
  });
  const storagePrice = await stripe.prices.create({
    product: storageProduct.id,
    unit_amount: Math.round(storagePriceMonthly * 100),
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { organization_id: orgId, storage_tb: String(storageTb) },
  });

  const subscriptionItems: Stripe.SubscriptionCreateParams.Item[] = [
    { price: storagePrice.id, quantity: 1 },
    { price: seatPriceId, quantity: maxSeats },
  ];

  for (const addonId of normalizedAddons) {
    const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
    subscriptionItems.push({ price: addonPriceId, quantity: 1 });
  }

  const inviteToken = crypto.randomUUID();

  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: subscriptionItems,
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
    metadata: {
      organization_id: orgId,
      invite_token: inviteToken,
    },
    expand: ["latest_invoice"],
  });

  const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
  const hostedInvoiceUrl = latestInvoice?.hosted_invoice_url;

  if (!hostedInvoiceUrl) {
    return NextResponse.json(
      { error: "Failed to get subscription payment URL" },
      { status: 500 }
    );
  }

  await db.collection("organizations").doc(orgId).update({
    invite_token: inviteToken,
    restore_invoice_url: hostedInvoiceUrl,
  });

  const orgName = (orgData.name as string) ?? "Organization";

  return NextResponse.json({
    success: true,
    orgId,
    org_name: orgName,
    hosted_invoice_url: hostedInvoiceUrl,
    message: "Subscription created. Owner must pay the invoice to complete restore. Files will be restored automatically when payment succeeds.",
  });
}
