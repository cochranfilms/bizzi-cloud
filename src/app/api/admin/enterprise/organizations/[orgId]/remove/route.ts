/**
 * POST /api/admin/enterprise/organizations/[orgId]/remove
 * Admin-only: Mark organization for removal. Sends emails to owner (detailed) and seat members (short).
 * Members have 14 days to save files. Cron job performs permanent deletion after deadline.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import { sendOrgRemovalOwnerEmail, sendOrgRemovalMemberEmail } from "@/lib/emailjs";
import { NextResponse } from "next/server";

const GRACE_DAYS = 14;

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
  const orgRef = db.collection("organizations").doc(orgId);
  const orgSnap = await orgRef.get();
  const orgData = orgSnap.data();

  if (!orgSnap.exists || !orgData) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (orgData.removal_requested_at) {
    return NextResponse.json(
      { error: "Organization is already pending removal" },
      { status: 400 }
    );
  }

  const orgName = (orgData.name as string) ?? "Organization";
  const now = new Date();
  const deadline = new Date(now);
  deadline.setDate(deadline.getDate() + GRACE_DAYS);

  // Mark org for removal
  const { Timestamp } = await import("firebase-admin/firestore");
  await orgRef.update({
    removal_requested_at: Timestamp.fromDate(now),
    removal_deadline: Timestamp.fromDate(deadline),
    removal_requested_by: auth.uid,
  });

  // Cancel Stripe subscription at period end
  const stripeSubscriptionId = orgData.stripe_subscription_id as string | undefined;
  if (stripeSubscriptionId) {
    try {
      const stripe = getStripeInstance();
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    } catch (err) {
      console.error("[remove-org] Failed to cancel Stripe subscription:", err);
      // Continue - cron will attempt cancel again
    }
  }

  // Fetch all seats (active and pending)
  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();

  const ownerSeat = seatsSnap.docs.find((d) => d.data().role === "admin");
  const ownerEmail = ownerSeat
    ? ((ownerSeat.data().email as string) ?? "").trim().toLowerCase()
    : "";

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io";
  const supportUrl = `${baseUrl}/support`;
  const deadlineStr = deadline.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Send owner email (detailed)
  if (ownerEmail) {
    try {
      await sendOrgRemovalOwnerEmail({
        to_email: ownerEmail,
        org_name: orgName,
        deadline_date: deadlineStr,
        support_url: supportUrl,
        grace_days: String(GRACE_DAYS),
      });
    } catch (err) {
      console.error("[remove-org] Failed to send owner email:", err);
      // Don't fail - emails are best-effort
    }
  }

  // Send member emails (short) to non-owner seats
  const seenEmails = new Set<string>();
  if (ownerEmail) seenEmails.add(ownerEmail);

  for (const doc of seatsSnap.docs) {
    const seatData = doc.data();
    const email = ((seatData.email as string) ?? "").trim().toLowerCase();
    if (!email || seenEmails.has(email)) continue;
    seenEmails.add(email);

    try {
      await sendOrgRemovalMemberEmail({
        to_email: email,
        org_name: orgName,
        deadline_date: deadlineStr,
        support_url: supportUrl,
        grace_days: String(GRACE_DAYS),
      });
    } catch (err) {
      console.error("[remove-org] Failed to send member email to", email, err);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Organization marked for removal. Emails sent. Deadline: ${deadlineStr}`,
    removal_deadline: deadline.toISOString(),
  });
}
