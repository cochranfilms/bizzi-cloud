import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import { sendSignupLinkEmail, sendSubscriptionWelcomeEmail } from "@/lib/emailjs";
import { sendSubscriptionReceiptForInvoiceId } from "@/lib/send-subscription-change-receipt";
import { buildSubscriptionWelcomeParamsFromInvoice } from "@/lib/subscription-welcome-params";
import {
  hasColdStorage,
  restoreColdStorageToHot,
} from "@/lib/cold-storage-restore";
import { finalizePersonalTeamColdStorage } from "@/lib/personal-team-container-finalize";
import { migrateConsumerToColdStorage } from "@/lib/cold-storage-migrate";
import { finalizeOrganizationColdStorage } from "@/lib/org-container-finalize";
import type { ColdStorageSourceType } from "@/lib/cold-storage-retention";
import {
  transitionToGracePeriod,
  restoreToActive,
  type StorageLifecycleStatus,
} from "@/lib/storage-lifecycle";
import { writeAuditLog } from "@/lib/audit-log";
import {
  resolveTeamSeatCountsForProfile,
  teamSeatCountsToFirestore,
  emptyTeamSeatCounts,
} from "@/lib/team-seat-pricing";
import Stripe from "stripe";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import {
  createNotification,
  getOrganizationActiveMemberUserIds,
  getOrganizationAdminUserIds,
} from "@/lib/notification-service";
import { computeStorageFromSubscription } from "@/lib/stripe-storage-from-subscription";
import { ORGANIZATION_INVITES_COLLECTION } from "@/lib/organization-invites";
import { ensurePersonalTeamRecord } from "@/lib/personal-team-auth";
import {
  cochranConnectJsonLog,
  mergeCochranConnectProfileFromStripeAccount,
} from "@/lib/stripe-connect-cochran";

type SubscriptionItemWithPrice = Stripe.SubscriptionItem & { price: Stripe.Price };

const SUBSCRIPTION_EXPAND_ITEMS = ["items.data.price.product"] as const;

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

      let storageQuotaBytes = getStorageBytesForPlan(planId as PlanId);
      let storageAddonId: string | null = null;
      let subscriptionItems: SubscriptionItemWithPrice[] | undefined;
      const subId: string | null =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription as Stripe.Subscription | null)?.id ?? null;
      if (subId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subId, {
            expand: [...SUBSCRIPTION_EXPAND_ITEMS],
          });
          const items = sub.items.data as SubscriptionItemWithPrice[];
          subscriptionItems = items;
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

      const sessionMeta = session.metadata as Record<string, string | undefined>;
      const teamResolved = resolveTeamSeatCountsForProfile(
        sessionMeta ?? {},
        subscriptionItems
      );
      const teamFirestore = teamSeatCountsToFirestore(teamResolved);

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
          await restoreToActive({ target: "profile", id: userId });
        } catch (err) {
          console.error("[Stripe webhook] Failed to restore cold storage for user", userId, err);
        }
      }
      const teamColdCheckout = await hasColdStorage({ teamOwnerUserId: userId });
      if (teamColdCheckout) {
        try {
          const tr = await restoreColdStorageToHot({
            type: "personal_team",
            teamOwnerUserId: userId,
          });
          console.log(
            "[Stripe webhook] checkout.session.completed: restored personal team cold storage for",
            userId,
            "files:",
            tr.restored
          );
        } catch (err) {
          console.error(
            "[Stripe webhook] Failed to restore personal team cold storage for user",
            userId,
            err
          );
        }
      }

      await db.collection("profiles").doc(userId).set(
        {
          userId,
          plan_id: planId,
          addon_ids: addonIds,
          seat_count: teamFirestore.seat_count,
          team_seat_counts: teamFirestore.team_seat_counts,
          storage_quota_bytes: storageQuotaBytes,
          storage_addon_id: storageAddonId,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: subId,
          billing_status: "active",
          unpaid_invoice_url: null,
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

    /**
     * Provisioning remains driven by `checkout.session.completed` and `invoice.paid`.
     * This event is intentional for audits, support, and future hooks when Stripe's delivery order differs.
     */
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string"
          ? sub.customer
          : sub.customer?.id ?? null;
      console.log(
        cochranConnectJsonLog({
          action: "subscription_created_observed",
          subscription_id: sub.id,
          customer: customerId,
          metadata_user_id: sub.metadata?.userId ?? null,
        })
      );
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const subMeta = subscription.metadata;
      const userId = subMeta?.userId as string | undefined;
      const orgId = subMeta?.organization_id as string | undefined;
      const planId = subMeta?.planId as PlanId | undefined;
      const planTier = (planId ?? "solo") as string;

      if (event.type === "customer.subscription.deleted") {
        // Consumer: migrate unless account delete flow handles it
        if (userId) {
          const profileSnap = await db.collection("profiles").doc(userId).get();
          const accountDeletionRequested = !!profileSnap.data()?.account_deletion_requested_at;
          if (!accountDeletionRequested) {
            const teamOwnerSeats = await db
              .collection("personal_team_seats")
              .where("team_owner_user_id", "==", userId)
              .limit(1)
              .get();
            if (!teamOwnerSeats.empty) {
              try {
                await finalizePersonalTeamColdStorage({
                  teamOwnerUserId: userId,
                  sourceType: "subscription_end" as ColdStorageSourceType,
                  auditTrigger: "subscription_deleted",
                });
                console.log(
                  "[Stripe webhook] subscription.deleted: finalized personal team for owner",
                  userId
                );
              } catch (err) {
                console.error(
                  "[Stripe webhook] Failed to finalize personal team cold storage:",
                  err
                );
              }
            }
            try {
              const result = await migrateConsumerToColdStorage(
                userId,
                "subscription_end" as ColdStorageSourceType,
                planTier
              );
              console.log(
                "[Stripe webhook] subscription.deleted: migrated consumer",
                userId,
                "files:",
                result.migrated
              );
            } catch (err) {
              console.error(
                "[Stripe webhook] Failed to migrate consumer to cold storage:",
                err
              );
            }
          }
          await db.collection("profiles").doc(userId).set(
            {
              plan_id: "free",
              addon_ids: [],
              seat_count: 1,
              team_seat_counts: emptyTeamSeatCounts(),
              storage_addon_id: null,
              storage_quota_bytes: getStorageBytesForPlan("free"),
              stripe_subscription_id: null,
              billing_status: "canceled",
              unpaid_invoice_url: null,
              storage_lifecycle_status: "cold_storage",
              grace_period_ends_at: FieldValue.delete(),
              stripe_updated_at: new Date().toISOString(),
            },
            { merge: true }
          );
          await createNotification({
            recipientUserId: userId,
            actorUserId: userId,
            type: "billing_subscription_canceled",
            allowSelfActor: true,
            metadata: { billingScope: "consumer", actorDisplayName: "Billing" },
          }).catch((err) =>
            console.error("[Stripe webhook] subscription.deleted consumer notify:", err)
          );
        }

        if (orgId) {
          const orgSnapPre = await db.collection("organizations").doc(orgId).get();
          const orgNamePre = (orgSnapPre.data()?.name as string) ?? "Organization";
          const memberUidsPre = await getOrganizationActiveMemberUserIds(db, orgId);
          try {
            const result = await finalizeOrganizationColdStorage({
              orgId,
              sourceType: "subscription_end" as ColdStorageSourceType,
              auditTrigger: "subscription_deleted",
              lifecycleBilling: "canceled",
              cancelStripeWhenPossible: false,
              isAdminRemoval: false,
            });
            console.log(
              "[Stripe webhook] subscription.deleted: finalized org",
              orgId,
              "skipped:",
              result.skipped,
              "migrated:",
              result.migrated
            );
          } catch (err) {
            console.error("[Stripe webhook] Failed to finalize org cold storage:", err);
          }
          await Promise.all(
            memberUidsPre.map((mid) =>
              createNotification({
                recipientUserId: mid,
                actorUserId: mid,
                type: "billing_subscription_canceled",
                allowSelfActor: true,
                metadata: {
                  billingScope: "org",
                  orgId,
                  orgName: orgNamePre,
                  actorDisplayName: "Billing",
                },
              }).catch((err) =>
                console.error("[Stripe webhook] subscription.deleted org notify:", mid, err)
              )
            )
          );
        }
        break;
      }

      // customer.subscription.updated
      if (subscription.status === "past_due" || subscription.status === "unpaid") {
        let unpaidInvoiceUrl: string | null = null;
        try {
          const latestInvoiceId =
            typeof subscription.latest_invoice === "string"
              ? subscription.latest_invoice
              : subscription.latest_invoice?.id;
          if (latestInvoiceId) {
            const inv = await stripe.invoices.retrieve(latestInvoiceId);
            unpaidInvoiceUrl = inv.hosted_invoice_url ?? null;
          }
        } catch (err) {
          console.warn("[Stripe webhook] Could not fetch latest_invoice:", err);
        }

        // Grace period: first failure -> transitionToGracePeriod, no migration
        if (userId) {
          const profileSnap = await db.collection("profiles").doc(userId).get();
          const currentStatus = profileSnap.data()?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
          if (currentStatus === "active" || !currentStatus) {
            await transitionToGracePeriod({
              target: "profile",
              id: userId,
              unpaidInvoiceUrl,
            });
          } else if (currentStatus === "grace_period") {
            await db.collection("profiles").doc(userId).update({
              unpaid_invoice_url: unpaidInvoiceUrl,
              stripe_updated_at: new Date().toISOString(),
            });
          } else {
            await db.collection("profiles").doc(userId).update({
              unpaid_invoice_url: unpaidInvoiceUrl,
              stripe_updated_at: new Date().toISOString(),
            });
          }
        }

        if (orgId) {
          const orgSnap = await db.collection("organizations").doc(orgId).get();
          const orgData = orgSnap.data();
          const removalDeadline = orgData?.removal_deadline;
          if (!removalDeadline) {
            const currentStatus = orgData?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
            if (currentStatus === "active" || !currentStatus) {
              await transitionToGracePeriod({
                target: "org",
                id: orgId,
                unpaidInvoiceUrl,
              });
            } else {
              await db.collection("organizations").doc(orgId).update({
                unpaid_invoice_url: unpaidInvoiceUrl,
              });
            }
          }
        }
        break;
      }

      // Status active: restore from grace or cold (restoreToActive clears grace/cold state)
      if (subscription.status === "active") {
        if (userId) {
          const profileSnap = await db.collection("profiles").doc(userId).get();
          const status = profileSnap.data()?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
          if (status === "grace_period") {
            await restoreToActive({ target: "profile", id: userId });
          }
        }
        if (orgId) {
          const orgSnap = await db.collection("organizations").doc(orgId).get();
          const status = orgSnap.data()?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
          if (status === "grace_period") {
            await restoreToActive({ target: "org", id: orgId });
          }
        }
      }

      // Standard profile/org update for active subscription (consumer only in this branch)
      if (userId && subscription.status === "active") {
        const addonIdsRaw = subMeta?.addonIds ?? "";
        const addonIds: string[] = addonIdsRaw.split(",").filter(Boolean);

        let storageQuotaBytes = planId
          ? getStorageBytesForPlan(planId)
          : getStorageBytesForPlan("free");
        let storageAddonId: string | null = null;
        let items: SubscriptionItemWithPrice[] = [];
        try {
          const sub = await stripe.subscriptions.retrieve(subscription.id, {
            expand: [...SUBSCRIPTION_EXPAND_ITEMS],
          });
          items = sub.items.data as SubscriptionItemWithPrice[];
          const computed = computeStorageFromSubscription(
            (planId as PlanId) ?? "free",
            items
          );
          storageQuotaBytes = computed.storageQuotaBytes;
          storageAddonId = computed.storageAddonId;
        } catch (err) {
          console.error("[Stripe webhook] Failed to expand subscription:", err);
        }

        const metaRecord = subMeta as unknown as Record<string, string | undefined>;
        const teamResolved = resolveTeamSeatCountsForProfile(metaRecord ?? {}, items);
        const teamFirestore = teamSeatCountsToFirestore(teamResolved);

        await db.collection("profiles").doc(userId).set(
          {
            plan_id: planId ?? "free",
            addon_ids: addonIds,
            seat_count: teamFirestore.seat_count,
            team_seat_counts: teamFirestore.team_seat_counts,
            storage_quota_bytes: storageQuotaBytes,
            storage_addon_id: storageAddonId,
            stripe_subscription_id: subscription.id,
            stripe_updated_at: new Date().toISOString(),
          },
          { merge: true }
        );
        await ensurePersonalTeamRecord(
          db,
          userId,
          {
            plan_id: planId ?? "free",
            team_seat_counts: teamFirestore.team_seat_counts,
          },
          { allowPlanBootstrap: true }
        );
        if (planId && planId !== "free") {
          await ensureDefaultDrivesForUser(userId);
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & { subscription?: string | { id: string } };
      const sub = invoice.subscription;
      const subscriptionId = typeof sub === "string" ? sub : sub?.id;
      if (!subscriptionId) {
        return NextResponse.json({ received: true });
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const subMeta = subscription.metadata;
      const userId = subMeta?.userId as string | undefined;
      const orgId = subMeta?.organization_id as string | undefined;
      const planTier = (subMeta?.planId ?? "solo") as string;
      const unpaidInvoiceUrl = invoice.hosted_invoice_url ?? null;

      if (userId) {
        const profileSnap = await db.collection("profiles").doc(userId).get();
        const currentStatus = profileSnap.data()?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
        if (currentStatus === "active" || !currentStatus) {
          await transitionToGracePeriod({
            target: "profile",
            id: userId,
            unpaidInvoiceUrl,
          });
        } else if (currentStatus === "grace_period") {
          await db.collection("profiles").doc(userId).update({
            unpaid_invoice_url: unpaidInvoiceUrl,
            stripe_updated_at: new Date().toISOString(),
          });
        } else {
          await db.collection("profiles").doc(userId).update({
            unpaid_invoice_url: unpaidInvoiceUrl,
            stripe_updated_at: new Date().toISOString(),
          });
        }
        await createNotification({
          recipientUserId: userId,
          actorUserId: userId,
          type: "billing_payment_failed",
          allowSelfActor: true,
          metadata: {
            unpaidInvoiceUrl: unpaidInvoiceUrl ?? undefined,
            actorDisplayName: "Billing",
            billingScope: "consumer",
          },
        }).catch((err) =>
          console.error("[Stripe webhook] invoice.payment_failed consumer notify:", err)
        );
      }

      if (orgId) {
        const orgSnap = await db.collection("organizations").doc(orgId).get();
        const orgData = orgSnap.data();
        const removalDeadline = orgData?.removal_deadline;
        if (!removalDeadline) {
          const currentStatus = orgData?.storage_lifecycle_status as StorageLifecycleStatus | undefined;
          if (currentStatus === "active" || !currentStatus) {
            await transitionToGracePeriod({
              target: "org",
              id: orgId,
              unpaidInvoiceUrl,
            });
          } else {
            await db.collection("organizations").doc(orgId).update({
              unpaid_invoice_url: unpaidInvoiceUrl,
            });
          }
        }
        const orgNameBill = (orgSnap.data()?.name as string) ?? "Organization";
        const adminUidsBill = await getOrganizationAdminUserIds(db, orgId);
        await Promise.all(
          adminUidsBill.map((aid) =>
            createNotification({
              recipientUserId: aid,
              actorUserId: aid,
              type: "billing_payment_failed",
              allowSelfActor: true,
              metadata: {
                unpaidInvoiceUrl: unpaidInvoiceUrl ?? undefined,
                orgId,
                orgName: orgNameBill,
                actorDisplayName: "Billing",
                billingScope: "org",
              },
            }).catch((err) =>
              console.error("[Stripe webhook] invoice.payment_failed org notify:", aid, err)
            )
          )
        );
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
        expand: [...SUBSCRIPTION_EXPAND_ITEMS],
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
            const wasScheduledDelete = await db
              .collection("cold_storage_files")
              .where("user_id", "==", consumerUserId)
              .where("org_id", "==", null)
              .where("source_type", "==", "account_delete")
              .limit(1)
              .get()
              .then((s) => !s.empty);
            try {
              const result = await restoreColdStorageToHot({ type: "consumer", userId: consumerUserId });
              console.log("[Stripe webhook] invoice.paid: restored consumer cold storage for user", consumerUserId, "files:", result.restored);
              await restoreToActive({ target: "profile", id: consumerUserId });
              if (wasScheduledDelete) {
                await writeAuditLog({
                  action: "account_deletion_canceled_by_payment",
                  uid: consumerUserId,
                  metadata: {},
                });
              }
            } catch (err) {
              console.error("[Stripe webhook] Failed to restore consumer cold storage for user", consumerUserId, err);
            }
          }
          const teamCold = await hasColdStorage({ teamOwnerUserId: consumerUserId });
          if (teamCold) {
            try {
              const tr = await restoreColdStorageToHot({
                type: "personal_team",
                teamOwnerUserId: consumerUserId,
              });
              console.log(
                "[Stripe webhook] invoice.paid: restored personal team cold storage for owner",
                consumerUserId,
                "files:",
                tr.restored
              );
            } catch (err) {
              console.error(
                "[Stripe webhook] Failed to restore personal team cold storage for user",
                consumerUserId,
                err
              );
            }
          }
        }

        // Send subscription welcome email (only on first payment)
        if (billingReason !== "subscription_create") {
          return NextResponse.json({ received: true });
        }

        if (consumerUserId) {
          const metaPlan = (subscription.metadata?.planId as string) ?? "subscription";
          const metaBilling = (subscription.metadata?.billing as string) ?? "monthly";
          void sendSubscriptionReceiptForInvoiceId({
            uid: consumerUserId,
            invoiceId: invoice.id,
            changeSummary: `Plan: ${metaPlan} · Billing: ${metaBilling}`,
            source: "checkout",
            subscriptionId,
          }).catch((err) =>
            console.error("[Stripe webhook] invoice.paid: subscription receipt email failed:", err)
          );
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
          const welcomeUserId = subscription.metadata?.userId as string | undefined;
          if (welcomeUserId) {
            await createNotification({
              recipientUserId: welcomeUserId,
              actorUserId: welcomeUserId,
              type: "billing_subscription_welcome",
              allowSelfActor: true,
              metadata: {
                planName: welcomeParams.plan_name,
                actorDisplayName: "Bizzi Cloud",
              },
            }).catch((err) =>
              console.error("[Stripe webhook] invoice.paid welcome notify:", err)
            );
          }
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
          await restoreToActive({ target: "org", id: orgId });
        } catch (err) {
          console.error("[Stripe webhook] Failed to restore cold storage for org", orgId, err);
        }
      }

      const orgName = (orgData.name as string) ?? "Organization";
      let ownerEmail: string | undefined;
      const invSnap = await db
        .collection(ORGANIZATION_INVITES_COLLECTION)
        .where("organization_id", "==", orgId)
        .where("role", "==", "admin")
        .where("status", "==", "pending")
        .limit(1)
        .get();
      if (!invSnap.empty) {
        ownerEmail = invSnap.docs[0].data()?.email as string | undefined;
      } else {
        const seatsSnap = await db
          .collection("organization_seats")
          .where("organization_id", "==", orgId)
          .where("role", "==", "admin")
          .where("status", "==", "pending")
          .limit(1)
          .get();
        ownerEmail = seatsSnap.docs[0]?.data()?.email as string | undefined;
      }
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

    case "account.updated": {
      const acct = event.data.object as Stripe.Account;
      try {
        await mergeCochranConnectProfileFromStripeAccount(db, acct);
      } catch (err) {
        console.error("[Stripe webhook] account.updated cochran connect reconcile:", err);
      }
      break;
    }

    case "capability.updated": {
      const cap = event.data.object as Stripe.Capability;
      const accountId =
        typeof cap.account === "string" ? cap.account : cap.account?.id;
      if (!accountId) break;
      try {
        const acct = await stripe.accounts.retrieve(accountId);
        await mergeCochranConnectProfileFromStripeAccount(db, acct);
      } catch (err) {
        console.error("[Stripe webhook] capability.updated cochran connect reconcile:", err);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
