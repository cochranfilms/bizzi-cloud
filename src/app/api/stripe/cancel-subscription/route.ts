import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

/**
 * Cancel subscription (downgrade to free).
 * Uses cancel_at_period_end so the user retains access until the current period ends.
 * Webhook customer.subscription.deleted will set plan_id to free when it actually ends.
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

  let body: { immediate?: boolean };
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const immediate = body.immediate === true;

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const stripeSubscriptionId = profileSnap.data()?.stripe_subscription_id as
    | string
    | undefined;

  if (!stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();

  try {
    if (immediate) {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }
  } catch (err) {
    console.error("[Stripe cancel-subscription]", err);
    return NextResponse.json(
      { error: "Failed to cancel subscription" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
