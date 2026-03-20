/**
 * POST /api/admin/enterprise/organizations/[orgId]/resend-signup-link
 * Admin-only: Manually send the sign-up link email to the org owner.
 * Use when the invoice.paid webhook did not fire (e.g. before it was enabled).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import { sendSignupLinkEmail } from "@/lib/emailjs";
import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { orgId } = await params;
  if (!orgId) {
    return NextResponse.json({ error: "Organization ID required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();

  if (!orgSnap.exists || !orgData) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const orgName = (orgData.name as string) ?? "Organization";
  let inviteToken = orgData.invite_token as string | undefined;

  // If invite_token not on org, fetch from Stripe (subscription or invoice metadata)
  if (!inviteToken) {
    const stripe = getStripeInstance();
    const stripeSubscriptionId = orgData.stripe_subscription_id as string | undefined;
    const stripeInvoiceId = orgData.stripe_invoice_id as string | undefined;

    if (stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
      inviteToken = subscription.metadata?.invite_token as string | undefined;
    } else if (stripeInvoiceId) {
      const invoice = await stripe.invoices.retrieve(stripeInvoiceId);
      inviteToken = invoice.metadata?.invite_token as string | undefined;
    } else {
      return NextResponse.json(
        { error: "Organization has no subscription or invoice. Cannot resend sign-up link." },
        { status: 400 }
      );
    }
  }

  if (!inviteToken) {
    return NextResponse.json(
      { error: "No invite token found. Organization may need stripe_subscription_id or stripe_invoice_id." },
      { status: 400 }
    );
  }

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("role", "==", "admin")
    .where("status", "==", "pending")
    .limit(1)
    .get();

  const ownerEmail = seatsSnap.docs[0]?.data()?.email as string | undefined;
  if (!ownerEmail) {
    return NextResponse.json(
      { error: "No pending admin seat found. Owner may have already accepted." },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io";
  const inviteUrl = `${baseUrl}/invite/join?token=${inviteToken}`;

  try {
    await sendSignupLinkEmail({
      to_email: ownerEmail,
      org_name: orgName,
      invite_url: inviteUrl,
    });
  } catch (err) {
    console.error("[resend-signup-link] EmailJS failed:", err);
    return NextResponse.json(
      { error: "Failed to send email. Check EmailJS configuration." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Sign-up link sent to ${ownerEmail}`,
  });
}
