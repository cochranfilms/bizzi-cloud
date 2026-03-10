import { getStripeInstance } from "@/lib/stripe";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Sign in required to purchase" },
      { status: 401 }
    );
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: { planId?: string; addonId?: string; billing?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const planId = body.planId as PlanId | undefined;
  const addonId = body.addonId as AddonId | undefined;
  const billing = (body.billing === "annual" ? "annual" : "monthly") as BillingCycle;

  const validPlanIds = ["solo", "indie", "video", "production"];
  if (!planId || !validPlanIds.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  let priceId: string;
  try {
    priceId = await getOrCreateStripePrice(planId as Exclude<PlanId, "free">, billing);
  } catch (err) {
    console.error("[Stripe checkout] Failed to get/create price:", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }

  const lineItems: { price: string; quantity: number }[] = [{ price: priceId, quantity: 1 }];
  let addonIds: string[] = [];

  if (addonId) {
    try {
      const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
      lineItems.push({ price: addonPriceId, quantity: 1 });
      addonIds = [addonId];
    } catch (err) {
      console.error("[Stripe checkout] Failed to get/create addon price:", err);
      return NextResponse.json(
        { error: "Checkout failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string" ? `https://${process.env.VERCEL_URL}` : null) ??
    request.headers.get("origin") ??
    "http://localhost:3000";

  const stripe = getStripeInstance();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      customer_email: email ?? undefined,
      success_url: `${baseUrl}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?checkout=cancelled`,
      metadata: {
        userId: uid,
        planId,
        addonIds: addonIds.join(","),
        billing,
      },
      subscription_data: {
        metadata: {
          userId: uid,
          planId,
          addonIds: addonIds.join(","),
          billing,
        },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Failed to create checkout session" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[Stripe checkout error]", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}
