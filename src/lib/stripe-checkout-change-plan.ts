import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  getOrCreateStripePrice,
  getOrCreateStripeAddonPrice,
} from "@/lib/stripe-prices";
import type { PlanId, AddonId, BillingCycle } from "@/lib/plan-constants";
import { NextResponse } from "next/server";

const VALID_PLAN_IDS = ["solo", "indie", "video", "production"];
const VALID_ADDON_IDS = ["gallery", "editor", "fullframe"];

export type CreateChangePlanCheckoutInput = {
  uid: string;
  planId: string;
  addonIds: AddonId[];
  billing: BillingCycle;
  origin: string;
};

export async function createChangePlanCheckoutSession(
  input: CreateChangePlanCheckoutInput
): Promise<NextResponse> {
  const { uid, planId, addonIds, billing, origin } = input;

  if (!planId || !VALID_PLAN_IDS.includes(planId)) {
    return NextResponse.json(
      { error: "Invalid or missing planId" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profile = profileSnap.data();
  const stripeCustomerId = profile?.stripe_customer_id as string | undefined;
  const stripeSubscriptionId = profile?.stripe_subscription_id as string | undefined;

  if (!stripeCustomerId || !stripeSubscriptionId) {
    return NextResponse.json(
      { error: "No active subscription. Sync from Stripe or upgrade first." },
      { status: 400 }
    );
  }

  let planPriceId: string;
  try {
    planPriceId = await getOrCreateStripePrice(
      planId as Exclude<PlanId, "free">,
      billing
    );
  } catch (err) {
    console.error("[Stripe checkout-change-plan] Failed to get plan price:", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }

  const lineItems: { price: string; quantity: number }[] = [
    { price: planPriceId, quantity: 1 },
  ];

  for (const addonId of addonIds) {
    try {
      const addonPriceId = await getOrCreateStripeAddonPrice(addonId);
      lineItems.push({ price: addonPriceId, quantity: 1 });
    } catch (err) {
      console.error("[Stripe checkout-change-plan] Failed to get addon price:", err);
      return NextResponse.json(
        { error: "Checkout failed. Please try again." },
        { status: 500 }
      );
    }
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof process.env.VERCEL_URL === "string"
      ? `https://${process.env.VERCEL_URL}`
      : null) ??
    origin ??
    "http://localhost:3000";

  const stripe = getStripeInstance();

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      line_items: lineItems,
      success_url: `${baseUrl}/dashboard/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}&updated=subscription`,
      cancel_url: `${baseUrl}/dashboard/change-plan`,
      metadata: {
        userId: uid,
        planId,
        addonIds: addonIds.join(","),
        billing,
        replace_subscription: stripeSubscriptionId,
      },
      subscription_data: {
        metadata: {
          userId: uid,
          planId,
          addonIds: addonIds.join(","),
          billing,
          replace_subscription: stripeSubscriptionId,
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
    console.error("[Stripe checkout-change-plan]", err);
    return NextResponse.json(
      { error: "Checkout failed. Please try again." },
      { status: 500 }
    );
  }
}
