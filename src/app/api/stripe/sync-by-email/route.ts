import { getStripeInstance } from "@/lib/stripe";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { getStorageBytesForPlan, type PlanId } from "@/lib/plan-constants";
import { ensureDefaultDrivesForUser } from "@/lib/ensure-default-drives";
import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  resolveTeamSeatCountsForProfile,
  teamSeatCountsToFirestore,
} from "@/lib/team-seat-pricing";

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

/**
 * Sync profile from Stripe by looking up the user's subscription via their email.
 * Use when webhook failed and session_id wasn't in the URL (older checkouts).
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Sign in required" },
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

  if (!email) {
    return NextResponse.json(
      { error: "No email on account" },
      { status: 400 }
    );
  }

  const stripe = getStripeInstance();

  const customers = await stripe.customers.list({
    email: email,
    limit: 5,
  });

  let planId: PlanId | undefined;
  let addonIds: string[] = [];
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;

  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 3,
    });

    for (const sub of subs.data) {
      const metaUserId = sub.metadata?.userId;
      if (metaUserId === uid) {
        planId = (sub.metadata?.planId as PlanId) ?? undefined;
        const raw = sub.metadata?.addonIds ?? "";
        addonIds = raw.split(",").filter(Boolean);
        stripeCustomerId = customer.id;
        stripeSubscriptionId = sub.id;
        break;
      }
    }
    if (planId) break;
  }

  if (!planId) {
    return NextResponse.json(
      { error: "No active subscription found for this account" },
      { status: 404 }
    );
  }

  let storageQuotaBytes = getStorageBytesForPlan(planId);
  let storageAddonId: string | null = null;
  let subscriptionItems: SubscriptionItemWithPrice[] | undefined;
  const subMetaRecord: Record<string, string | undefined> = {};
  if (stripeSubscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
        expand: ["items.data.price"],
      });
      Object.assign(subMetaRecord, sub.metadata ?? {});
      const items = sub.items.data as SubscriptionItemWithPrice[];
      subscriptionItems = items;
      const computed = computeStorageFromSubscription(planId, items);
      storageQuotaBytes = computed.storageQuotaBytes;
      storageAddonId = computed.storageAddonId;
    } catch (err) {
      console.error("[Stripe sync-by-email] Failed to expand subscription:", err);
    }
  }
  const teamResolved = resolveTeamSeatCountsForProfile(
    subMetaRecord,
    subscriptionItems
  );
  const teamFirestore = teamSeatCountsToFirestore(teamResolved);

  const db = getAdminFirestore();
  await db.collection("profiles").doc(uid).set(
    {
      userId: uid,
      plan_id: planId,
      addon_ids: addonIds,
      seat_count: teamFirestore.seat_count,
      team_seat_counts: teamFirestore.team_seat_counts,
      storage_quota_bytes: storageQuotaBytes,
      storage_addon_id: storageAddonId,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );
  await ensureDefaultDrivesForUser(uid);

  return NextResponse.json({
    ok: true,
    plan_id: planId,
    storage_quota_bytes: storageQuotaBytes,
  });
}
