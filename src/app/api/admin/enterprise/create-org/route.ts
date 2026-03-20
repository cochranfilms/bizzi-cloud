/**
 * POST /api/admin/enterprise/create-org
 * Admin-only: Create an organization, Stripe subscription (recurring monthly), and send payment email via EmailJS.
 * Org receives sign-up link only after paying the first invoice (via webhook). Subsequent months auto-charge.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { hashInviteToken } from "@/lib/invite-token";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { EnterpriseThemeId } from "@/types/enterprise";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";
import { ENTERPRISE_SEAT_PRICE } from "@/lib/enterprise-pricing";
import Stripe from "stripe";
import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripeSeatPrice,
  getOrCreateStripeAddonPrice,
} from "@/lib/stripe-prices";
import type { AddonId } from "@/lib/plan-constants";
import { powerUpAddons } from "@/lib/pricing-data";
import { sendInvoiceEmail } from "@/lib/emailjs";

const TB = 1024 * 1024 * 1024 * 1024;

function formatStorageLabel(bytes: number): string {
  const tb = bytes / TB;
  if (tb >= 1) return `${tb} TB`;
  const gb = bytes / (1024 ** 3);
  return `${gb} GB`;
}

export async function POST(request: Request) {
  const authResult = await requireAdminAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"] as const;
  const MIN_STORAGE_TB = 20;
  let body: {
    org_name?: string;
    owner_email?: string;
    max_seats?: number;
    storage_tb?: number;
    storage_price_monthly?: number;
    addon_ids?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const orgName =
    typeof body.org_name === "string" ? body.org_name.trim() : "";
  const ownerEmail =
    typeof body.owner_email === "string"
      ? body.owner_email.trim().toLowerCase()
      : "";

  if (!orgName || orgName.length < 2) {
    return NextResponse.json(
      { error: "Organization name must be at least 2 characters" },
      { status: 400 }
    );
  }

  if (!ownerEmail || !ownerEmail.includes("@")) {
    return NextResponse.json(
      { error: "Valid owner email is required" },
      { status: 400 }
    );
  }

  const maxSeats =
    typeof body.max_seats === "number" && body.max_seats >= 1
      ? Math.floor(body.max_seats)
      : null;
  if (maxSeats === null) {
    return NextResponse.json(
      { error: "max_seats is required and must be at least 1" },
      { status: 400 }
    );
  }
  const storageTb =
    typeof body.storage_tb === "number" && body.storage_tb >= MIN_STORAGE_TB
      ? Math.floor(body.storage_tb)
      : MIN_STORAGE_TB;
  const storagePriceMonthly =
    typeof body.storage_price_monthly === "number" && body.storage_price_monthly > 0
      ? body.storage_price_monthly
      : 0;
  if (storagePriceMonthly <= 0) {
    return NextResponse.json(
      { error: "storage_price_monthly is required and must be greater than 0" },
      { status: 400 }
    );
  }
  const storageQuotaBytes = storageTb * TB;

  // Normalize addon_ids: if fullframe selected, use only fullframe; else use selected gallery/editor
  const rawAddonIds = Array.isArray(body.addon_ids)
    ? body.addon_ids.filter((id): id is AddonId =>
        typeof id === "string" && VALID_ADDON_IDS.includes(id as (typeof VALID_ADDON_IDS)[number])
      )
    : [];
  const addonIds: AddonId[] =
    rawAddonIds.includes("fullframe")
      ? ["fullframe"]
      : (rawAddonIds as AddonId[]);

  const db = getAdminFirestore();
  const stripe = getStripeInstance();

  const inviteToken = crypto.randomUUID();
  const inviteTokenHash = hashInviteToken(inviteToken);
  const pendingId = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = FieldValue.serverTimestamp();

  const orgRef = db.collection("organizations").doc();
  const orgId = orgRef.id;

  // Create or get Stripe customer by email
  const existingCustomers = await stripe.customers.list({
    email: ownerEmail,
    limit: 1,
  });
  let stripeCustomerId: string;
  if (existingCustomers.data.length > 0) {
    stripeCustomerId = existingCustomers.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email: ownerEmail,
      name: orgName,
    });
    stripeCustomerId = customer.id;
  }

  const seatPriceId = await getOrCreateStripeSeatPrice();

  // Create custom Stripe price for this org's storage (TB + custom price)
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

  for (const addonId of addonIds) {
    const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
    subscriptionItems.push({ price: addonPriceId, quantity: 1 });
  }

  // Create subscription (recurring monthly). First invoice is unpaid; we send payment link.
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

  const storageLabel = formatStorageLabel(storageQuotaBytes);

  // Create org and pending seat in Firestore (store invite_token for webhook fallback)
  await orgRef.set({
    name: orgName,
    theme: "bizzi" as EnterpriseThemeId,
    storage_quota_bytes: storageQuotaBytes,
    storage_used_bytes: 0,
    created_at: now,
    created_by: authResult.uid,
    max_seats: maxSeats,
    addon_ids: addonIds.length > 0 ? addonIds : [],
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscription.id,
    invite_token: inviteToken,
  });

  await db.collection("organization_seats").doc(pendingId).set({
    organization_id: orgId,
    user_id: "",
    role: "admin",
    email: ownerEmail,
    display_name: null,
    invited_at: now,
    accepted_at: null,
    status: "pending",
    invited_by: authResult.uid,
    invite_token_hash: inviteTokenHash,
    storage_quota_bytes: DEFAULT_SEAT_STORAGE_BYTES,
  });

  // Send subscription payment email via EmailJS
  let totalCents =
    Math.round(storagePriceMonthly * 100) + maxSeats * ENTERPRISE_SEAT_PRICE * 100;
  let addonsLine: string | undefined;
  for (const addonId of addonIds) {
    const addon = powerUpAddons.find((a) => a.id === addonId);
    const price = addon?.price ?? 0;
    totalCents += price * 100;
    const label = addon?.name ?? addonId;
    addonsLine = addonsLine
      ? `${addonsLine}; ${label} — $${price.toFixed(2)}/mo`
      : `${label} — $${price.toFixed(2)}/mo`;
  }
  const amountStr = `$${(totalCents / 100).toFixed(2)}/mo`;
  const storageLine = `${storageLabel} Enterprise Storage — $${storagePriceMonthly.toFixed(2)}/mo`;
  const seatsLine = `${maxSeats} seat${maxSeats > 1 ? "s" : ""} × $${ENTERPRISE_SEAT_PRICE}/mo — $${(maxSeats * ENTERPRISE_SEAT_PRICE).toFixed(2)}/mo`;

  const emailParams: Parameters<typeof sendInvoiceEmail>[0] = {
    to_email: ownerEmail,
    org_name: orgName,
    invoice_url: hostedInvoiceUrl,
    amount: amountStr,
    storage_line: storageLine,
    seats_line: seatsLine,
  };
  if (addonsLine) emailParams.addons_line = addonsLine;

  try {
    await sendInvoiceEmail(emailParams);
  } catch (err) {
    console.error("[create-org] EmailJS subscription email failed:", err);
    return NextResponse.json(
      {
        error: "Organization and subscription created, but failed to send payment email. Check EmailJS configuration.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    organization_id: orgId,
    org_name: orgName,
    owner_email: ownerEmail,
    success: true,
    message: "Organization created. Subscription payment link sent to owner. Sign-up link will be sent after first payment. Future months will auto-charge.",
  });
}
