/**
 * POST /api/admin/cold-storage/restore-consumer
 * Admin-only: Create a Stripe Checkout session for a consumer in cold storage.
 * Returns checkout URL; when user pays, checkout.session.completed restores cold storage.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { getStripeInstance } from "@/lib/stripe";
import { getOrCreateStripePrice } from "@/lib/stripe-prices";
import type { PlanId, BillingCycle } from "@/lib/plan-constants";
import { hasColdStorage } from "@/lib/cold-storage-restore";
import type Stripe from "stripe";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { userId?: string; planId?: string; billing?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    );
  }

  const planId = (body.planId || "solo") as PlanId;
  const validPlans: PlanId[] = ["solo", "indie", "video", "production"];
  if (!validPlans.includes(planId)) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }

  const billing = (body.billing === "annual" ? "annual" : "monthly") as BillingCycle;

  const db = getAdminFirestore();
  const adminAuth = getAdminAuth();

  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profileData = profileSnap.data();
  if (!profileSnap.exists || !profileData) {
    return NextResponse.json(
      { error: "User profile not found" },
      { status: 404 }
    );
  }

  const hasCold = await hasColdStorage({ userId });
  if (!hasCold) {
    return NextResponse.json(
      { error: "No cold storage files found for this user." },
      { status: 400 }
    );
  }

  let email: string = "";
  try {
    const userRecord = await adminAuth.getUser(userId);
    email = (userRecord.email ?? "").trim().toLowerCase();
  } catch {
    email = (profileData.email as string)?.trim()?.toLowerCase() ?? "";
  }
  if (!email) {
    return NextResponse.json(
      { error: "User has no email. Cannot create checkout." },
      { status: 400 }
    );
  }

  const stripeCustomerId = profileData.stripe_customer_id as string | undefined;

  let priceId: string;
  try {
    priceId = await getOrCreateStripePrice(
      planId as Exclude<PlanId, "free">,
      billing
    );
  } catch (err) {
    console.error("[restore-consumer] Failed to get price:", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    "https://www.bizzicloud.io";

  const stripe = getStripeInstance();
  const metadata: Record<string, string> = {
    userId,
    planId,
    addonIds: "",
    billing,
    seat_count: "1",
    team_seats_none: "0",
    team_seats_gallery: "0",
    team_seats_editor: "0",
    team_seats_fullframe: "0",
  };

  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "subscription",
      payment_method_types: ["card" as const],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/dashboard/change-plan?checkout=cancelled`,
      metadata,
      subscription_data: { metadata: { ...metadata } },
      ...(stripeCustomerId ? { customer: stripeCustomerId } : { customer_email: email }),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    const userEmail = email;

    return NextResponse.json({
      success: true,
      userId,
      user_email: userEmail,
      checkout_url: session.url,
      message:
        "Checkout session created. Send the link to the user. When they pay, files will restore automatically.",
    });
  } catch (err) {
    console.error("[restore-consumer] Stripe error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout" },
      { status: 500 }
    );
  }
}
