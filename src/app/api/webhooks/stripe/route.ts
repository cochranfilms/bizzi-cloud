import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import Stripe from "stripe";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Stripe webhooks require raw body for signature verification.
 * Do NOT use request.json() - use request.text() instead.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Stripe webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripeInstance();
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    console.error("[Stripe webhook] Signature verification failed:", msg);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const stripe = getStripeInstance();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId as PlanId | undefined;
      const addonIdsRaw = session.metadata?.addonIds;
      const replaceSubscriptionId = session.metadata?.replace_subscription as
        | string
        | undefined;

      if (!userId || !planId) {
        console.error("[Stripe webhook] checkout.session.completed missing userId or planId in metadata");
        return NextResponse.json({ received: true });
      }

      const addonIds: string[] = addonIdsRaw
        ? addonIdsRaw.split(",").filter(Boolean)
        : [];

      const storageQuotaBytes = getStorageBytesForPlan(planId as PlanId);

      if (replaceSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(replaceSubscriptionId);
        } catch (err) {
          console.error("[Stripe webhook] Failed to cancel replaced subscription:", err);
        }
      }

      await db.collection("profiles").doc(userId).set(
        {
          userId,
          plan_id: planId,
          addon_ids: addonIds,
          storage_quota_bytes: storageQuotaBytes,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: session.subscription ?? null,
          stripe_updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      await ensureDefaultDrivesForUser(userId);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subMeta = subscription.metadata;
      const userId = subMeta?.userId;
      const planId = subMeta?.planId as PlanId | undefined;

      if (!userId) {
        return NextResponse.json({ received: true });
      }

      if (event.type === "customer.subscription.deleted") {
        await db.collection("profiles").doc(userId).set(
          {
            plan_id: "free",
            addon_ids: [],
            storage_quota_bytes: getStorageBytesForPlan("free"),
            stripe_subscription_id: null,
            stripe_updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
        break;
      }

      const addonIdsRaw = subMeta?.addonIds ?? "";
      const addonIds: string[] = addonIdsRaw.split(",").filter(Boolean);

      const storageQuotaBytes = planId
        ? getStorageBytesForPlan(planId)
        : getStorageBytesForPlan("free");

      await db.collection("profiles").doc(userId).set(
        {
          plan_id: planId ?? "free",
          addon_ids: addonIds,
          storage_quota_bytes: storageQuotaBytes,
          stripe_subscription_id: subscription.id,
          stripe_updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      if (planId && planId !== "free") {
        await ensureDefaultDrivesForUser(userId);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
