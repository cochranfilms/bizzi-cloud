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
import {
  ENTERPRISE_ORG_STORAGE_BYTES,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "@/lib/enterprise-storage";
import {
  ENTERPRISE_SEAT_PRICE,
  getStoragePriceMonthly,
  getStorageTierByBytes,
} from "@/lib/enterprise-pricing";
import Stripe from "stripe";
import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripeEnterpriseStoragePrice,
  getOrCreateStripeSeatPrice,
  type EnterpriseStorageTierId,
} from "@/lib/stripe-prices";
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

  let body: {
    org_name?: string;
    owner_email?: string;
    max_seats?: number;
    storage_quota_bytes?: number;
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
  const storageQuotaBytes =
    typeof body.storage_quota_bytes === "number" && body.storage_quota_bytes > 0
      ? body.storage_quota_bytes
      : ENTERPRISE_ORG_STORAGE_BYTES;

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

  // Get storage tier for Stripe price (must be a standard tier: 1tb, 5tb, 16tb)
  const storageTier = getStorageTierByBytes(storageQuotaBytes);
  const tierId = (storageTier?.id ?? "1tb") as EnterpriseStorageTierId;

  const storagePriceId = await getOrCreateStripeEnterpriseStoragePrice(tierId);
  const seatPriceId = await getOrCreateStripeSeatPrice();

  // Create subscription (recurring monthly). First invoice is unpaid; we send payment link.
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [
      { price: storagePriceId, quantity: 1 },
      { price: seatPriceId, quantity: maxSeats },
    ],
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

  const storagePriceMonthly = getStoragePriceMonthly(storageQuotaBytes);
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
  const totalCents =
    Math.round(storagePriceMonthly * 100) + maxSeats * ENTERPRISE_SEAT_PRICE * 100;
  const amountStr = `$${(totalCents / 100).toFixed(2)}/mo`;
  const storageLine = `${storageLabel} Enterprise Storage — $${storagePriceMonthly.toFixed(2)}/mo`;
  const seatsLine = `${maxSeats} seat${maxSeats > 1 ? "s" : ""} × $${ENTERPRISE_SEAT_PRICE}/mo — $${(maxSeats * ENTERPRISE_SEAT_PRICE).toFixed(2)}/mo`;

  try {
    await sendInvoiceEmail({
      to_email: ownerEmail,
      org_name: orgName,
      invoice_url: hostedInvoiceUrl,
      amount: amountStr,
      storage_line: storageLine,
      seats_line: seatsLine,
    });
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
