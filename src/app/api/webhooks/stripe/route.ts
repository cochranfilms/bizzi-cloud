import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import { sendSignupLinkEmail, sendSubscriptionWelcomeEmail } from "@/lib/emailjs";
import { buildSubscriptionWelcomeParamsFromInvoice } from "@/lib/subscription-welcome-params";
import { hasColdStorage, restoreColdStorageToHot } from "@/lib/cold-storage-restore";
import Stripe from "stripe";
import { NextResponse } from "next/server";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

function computeStorageFromSubscription(
  planId: PlanId,
  items: SubscriptionItemWithPrice[]
): { storageQuotaBytes: number; storageAddonId: string | null } {
  let storageAddonTb = 0;
  let storageAddonId: string | null = null;
  for (const item of items) {
    if (item.deleted) continue;
    const meta = item.price?.metadata;
    const addonId = meta?.storage_addon_id as string | undefined;
    const tb = meta?.storage_addon_tb ? parseInt(String(meta.storage_addon_tb), 10) : 0;
    if (addonId && !isNaN(tb) && tb > 0) {
      storageAddonTb += tb;
      storageAddonId = addonId;
    }
  }
  const baseBytes = getStorageBytesForPlan(planId);
  const addonBytes = storageAddonTb * 1024 ** 4;
  return {
    storageQuotaBytes: baseBytes + addonBytes,
    storageAddonId,
  };
}

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

  // Idempotency: Stripe retries webhooks on timeout or non-2xx. Process each event at most once.
  const eventDocRef = db.collection("webhook_events").doc(event.id);
  const existingSnap = await eventDocRef.get();
  if (existingSnap.exists) {
    return NextResponse.json({ received: true });
  }

  await eventDocRef.set({
    event_type: event.type,
    processed_at: new Date().toISOString(),
  });

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

      // Mark pending_checkouts as completed (for both guest and auth flows)
      await db.collection("pending_checkouts").doc(session.id).update({
        status: "completed",
      }).catch(() => {});

      // Subscription welcome email is sent from invoice.paid (reliable trigger when payment succeeds)

      if (!userId || !planId) {
        // Guest checkout: account creation handled by /account/setup page
        return NextResponse.json({ received: true });
      }

      const addonIds: string[] = addonIdsRaw
        ? addonIdsRaw.split(",").filter(Boolean)
        : [];
      const seatCountRaw = session.metadata?.seat_count;
      const seatCount =
        typeof seatCountRaw === "string" && /^\d+$/.test(seatCountRaw)
          ? parseInt(seatCountRaw, 10)
          : 1;

      let storageQuotaBytes = getStorageBytesForPlan(planId as PlanId);
      let storageAddonId: string | null = null;
      const subId: string | null =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id ?? null;
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId, {
            expand: ["items.data.price"],
          });
          const items = sub.items.data as SubscriptionItemWithPrice[];
          const computed = computeStorageFromSubscription(
            planId as PlanId,
            items
          );
          storageQuotaBytes = computed.storageQuotaBytes;
          storageAddonId = computed.storageAddonId;
        } catch (err) {
          console.error("[Stripe webhook] Failed to expand subscription:", err);
        }
      }

      if (replaceSubscriptionId) {
        try {
          await stripe.subscriptions.cancel(replaceSubscriptionId);
        } catch (err) {
          console.error("[Stripe webhook] Failed to cancel replaced subscription:", err);
        }
      }

      // Restore cold storage to hot if user has cold storage (automated restore on payment)
      const hadColdStorage = await hasColdStorage({ userId });
      if (hadColdStorage) {
        try {
          const result = await restoreColdStorageToHot({ type: "consumer", userId });
          console.log("[Stripe webhook] checkout.session.completed: restored cold storage for user", userId, "files:", result.restored);
        } catch (err) {
          console.error("[Stripe webhook] Failed to restore cold storage for user", userId, err);
        }
      }

      await db.collection("profiles").doc(userId).set(
        {
          userId,
          plan_id: planId,
          addon_ids: addonIds,
          seat_count: seatCount,
          storage_quota_bytes: storageQuotaBytes,
          storage_addon_id: storageAddonId,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: subId,
          stripe_updated_at: new Date().toISOString(),
        },
        { merge: true }
      );
      await ensureDefaultDrivesForUser(userId);
      break;
    }

    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await db.collection("pending_checkouts").doc(session.id).update({
        status: "abandoned",
      }).catch(() => {});
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
            seat_count: 1,
            storage_addon_id: null,
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
      const seatCountRaw = subMeta?.seat_count;
      const seatCount =
        typeof seatCountRaw === "string" && /^\d+$/.test(seatCountRaw)
          ? parseInt(seatCountRaw, 10)
          : 1;

      let storageQuotaBytes = planId
        ? getStorageBytesForPlan(planId)
        : getStorageBytesForPlan("free");
      let storageAddonId: string | null = null;
      try {
        const sub = await stripe.subscriptions.retrieve(subscription.id, {
          expand: ["items.data.price"],
        });
        const items = sub.items.data as SubscriptionItemWithPrice[];
        const computed = computeStorageFromSubscription(
          (planId as PlanId) ?? "free",
          items
        );
        storageQuotaBytes = computed.storageQuotaBytes;
        storageAddonId = computed.storageAddonId;
      } catch (err) {
        console.error("[Stripe webhook] Failed to expand subscription:", err);
      }

      await db.collection("profiles").doc(userId).set(
        {
          plan_id: planId ?? "free",
          addon_ids: addonIds,
          seat_count: seatCount,
          storage_quota_bytes: storageQuotaBytes,
          storage_addon_id: storageAddonId,
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

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      // Only send sign-up link on first subscription payment (not renewals)
      const billingReason = invoice.billing_reason;
      if (billingReason !== "subscription_create" && billingReason !== "subscription") {
        return NextResponse.json({ received: true });
      }

      const sub = (invoice as { subscription?: string | { id: string } }).subscription;
      const subscriptionId = typeof sub === "string" ? sub : sub?.id;
      if (!subscriptionId) {
        console.error("[Stripe webhook] invoice.paid: no subscription on invoice", invoice.id);
        return NextResponse.json({ received: true });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["items.data.price"],
      });
      let orgId = subscription.metadata?.organization_id as string | undefined;
      let inviteToken = subscription.metadata?.invite_token as string | undefined;

      // Fallback: find org by stripe_subscription_id if metadata missing (e.g. older subscriptions)
      if (!orgId || !inviteToken) {
        const orgsSnap = await db
          .collection("organizations")
          .where("stripe_subscription_id", "==", subscriptionId)
          .limit(1)
          .get();
        const orgDoc = orgsSnap.docs[0];
        if (orgDoc) {
          const orgData = orgDoc.data();
          orgId = orgDoc.id;
          inviteToken = (orgData.invite_token as string) ?? inviteToken;
        }
      }

      if (!orgId || !inviteToken) {
        // Consumer subscription — restore cold storage if applicable, then send welcome email
        const consumerUserId = subscription.metadata?.userId as string | undefined;
        if (consumerUserId) {
          const consumerHadColdStorage = await hasColdStorage({ userId: consumerUserId });
          if (consumerHadColdStorage) {
            try {
              const result = await restoreColdStorageToHot({ type: "consumer", userId: consumerUserId });
              console.log("[Stripe webhook] invoice.paid: restored consumer cold storage for user", consumerUserId, "files:", result.restored);
            } catch (err) {
              console.error("[Stripe webhook] Failed to restore consumer cold storage for user", consumerUserId, err);
            }
          }
        }

        // Send subscription welcome email (only on first payment)
        if (billingReason !== "subscription_create") {
          return NextResponse.json({ received: true });
        }
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ??
          (typeof process.env.VERCEL_URL === "string"
            ? `https://${process.env.VERCEL_URL}`
            : null) ??
          "https://www.bizzicloud.io";
        let sessionId: string | null = null;
        try {
          const sessions = await stripe.checkout.sessions.list({
            subscription: subscriptionId,
            status: "complete",
            limit: 1,
          });
          sessionId = sessions.data[0]?.id ?? null;
        } catch (err) {
          console.warn("[Stripe webhook] invoice.paid: could not list checkout sessions:", err);
        }
        const welcomeParams = buildSubscriptionWelcomeParamsFromInvoice(
          subscription,
          invoice,
          sessionId,
          baseUrl
        );
        if (welcomeParams) {
          sendSubscriptionWelcomeEmail(welcomeParams)
            .then(() => {
              console.log("[Stripe webhook] invoice.paid: subscription welcome email sent to", welcomeParams.to_email);
            })
            .catch((err) => {
              console.error("[Stripe webhook] invoice.paid: subscription welcome email failed:", err);
            });
        }
        return NextResponse.json({ received: true });
      }

      const orgSnap = await db.collection("organizations").doc(orgId).get();
      const orgData = orgSnap.data();
      if (!orgSnap.exists || !orgData) {
        return NextResponse.json({ received: true });
      }

      // Restore cold storage to hot if org has cold storage (automated restore on payment)
      const orgHadColdStorage = await hasColdStorage({ orgId });
      if (orgHadColdStorage) {
        try {
          const result = await restoreColdStorageToHot({
            type: "org",
            orgId,
            stripeSubscriptionId: subscriptionId,
          });
          console.log("[Stripe webhook] invoice.paid: restored cold storage for org", orgId, "files:", result.restored);
        } catch (err) {
          console.error("[Stripe webhook] Failed to restore cold storage for org", orgId, err);
        }
      }

      const orgName = (orgData.name as string) ?? "Organization";
      const seatsSnap = await db
        .collection("organization_seats")
        .where("organization_id", "==", orgId)
        .where("role", "==", "admin")
        .where("status", "==", "pending")
        .limit(1)
        .get();

      const ownerEmail =
        seatsSnap.docs[0]?.data()?.email as string | undefined;
      if (!ownerEmail) {
        console.error("[Stripe webhook] invoice.paid: no pending admin seat for org", orgId, "- ensure webhook has invoice.paid enabled");
        return NextResponse.json({ received: true });
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
        console.log("[Stripe webhook] invoice.paid: sign-up link email sent to", ownerEmail);
      } catch (err) {
        console.error("[Stripe webhook] invoice.paid: failed to send sign-up link email:", err);
        console.error("[Stripe webhook] Ensure EMAILJS_TEMPLATE_ID_SIGNUP is set and signup-link template exists in EmailJS dashboard");
      }

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
