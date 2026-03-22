/**
 * GET /api/admin/overview
 * Returns real platform metrics from Firestore + Stripe + B2.
 * No placeholder data: all metrics from real sources.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { isB2Configured, listBucketStats } from "@/lib/b2";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { PlanId } from "@/lib/plan-constants";
import { AggregateField, Timestamp } from "firebase-admin/firestore";

/** B2 Pay-as-you-go: $6/TB/month. First 10GB free. */
const B2_STORAGE_USD_PER_TB = 6;
const B2_FREE_BYTES = 10 * 1024 * 1024 * 1024;

function estimateB2StorageCost(totalBytes: number): number {
  const billableBytes = Math.max(0, totalBytes - B2_FREE_BYTES);
  const billableTB = billableBytes / (1024 ** 4);
  return Math.round(billableTB * B2_STORAGE_USD_PER_TB * 100) / 100;
}

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();

  const [
    profilesSnap,
    orgsSnap,
    supportOpenSnap,
    uploadSessionsTodaySnap,
    pastDueSubsSnap,
  ] = await Promise.all([
    db.collection("profiles").get(),
    db.collection("organizations").get(),
    db.collection("support_tickets").where("status", "in", ["open", "in_progress"]).count().get(),
    db
      .collection("upload_sessions")
      .where("createdAt", ">=", new Date().toISOString().slice(0, 10))
      .get(),
    (async () => {
      try {
        const stripe = getStripeInstance();
        const subs = await stripe.subscriptions.list({ status: "past_due", limit: 100 });
        return subs.data.length;
      } catch {
        return 0;
      }
    })(),
  ]);

  const profiles = profilesSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data } as { id: string; plan_id?: string; storage_used_bytes?: number };
  });

  const totalUsers = profiles.length;
  const payingProfiles = profiles.filter(
    (p) => p.plan_id && p.plan_id !== "free"
  );
  const freeUsers = totalUsers - payingProfiles.length;

  let totalStorageFromProfiles = 0;
  for (const p of profiles) {
    totalStorageFromProfiles += typeof p.storage_used_bytes === "number" ? p.storage_used_bytes : 0;
  }

  for (const doc of orgsSnap.docs) {
    const data = doc.data();
    const used =
      typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    totalStorageFromProfiles += used;
  }

  let totalStorageBytes = totalStorageFromProfiles;
  try {
    const q = db.collection("backup_files").where("deleted_at", "==", null);
    const agg = q.aggregate({ totalBytes: AggregateField.sum("size_bytes") });
    const aggSnap = await agg.get();
    const filesSum = Number(aggSnap.data().totalBytes ?? 0);
    if (filesSum > 0) {
      totalStorageBytes =
        totalStorageFromProfiles > 0 && totalStorageFromProfiles >= filesSum
          ? totalStorageFromProfiles
          : filesSum;
    }
  } catch (err) {
    console.warn("[admin/overview] Storage aggregation failed, using profile+org total:", err);
  }

  const supportTicketsOpen = supportOpenSnap.data().count;

  let criticalAlertsCount = pastDueSubsSnap;
  for (const d of profilesSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    const quota = typeof data.storage_quota_bytes === "number" ? data.storage_quota_bytes : 2 * 1024 ** 3;
    if (quota > 0 && used >= quota * 0.95) criticalAlertsCount++;
  }

  const uploadsToday = uploadSessionsTodaySnap.docs.filter(
    (d) => (d.data().status as string) === "completed"
  ).length;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const cutoff24h = Timestamp.fromDate(yesterday);
  const cutoff30d = Timestamp.fromDate(monthAgo);

  let activeUsersToday = 0;
  let activeUsersMonth = 0;
  try {
    const [todaySnap, monthSnap] = await Promise.all([
      db
        .collection("activity_logs")
        .where("created_at", ">=", cutoff24h)
        .get(),
      db
        .collection("activity_logs")
        .where("created_at", ">=", cutoff30d)
        .get(),
    ]);
    const todayIds = new Set<string>();
    const monthIds = new Set<string>();
    for (const d of todaySnap.docs) {
      const uid = (d.data().actor_user_id as string) || "";
      if (uid) todayIds.add(uid);
    }
    for (const d of monthSnap.docs) {
      const uid = (d.data().actor_user_id as string) || "";
      if (uid) monthIds.add(uid);
    }
    activeUsersToday = todayIds.size;
    activeUsersMonth = monthIds.size;
  } catch (err) {
    console.warn("[admin/overview] Activity aggregation failed:", err);
  }

  const avgStoragePerUserBytes =
    totalUsers > 0 ? Math.floor(totalStorageBytes / totalUsers) : 0;

  let mrr = 0;
  let subscriptionsByPlan: Record<string, number> = {};
  try {
    const stripe = getStripeInstance();
    const subs = await stripe.subscriptions.list({
      status: "active",
      expand: ["data.items.data.price"],
      limit: 100,
    });

    for (const sub of subs.data) {
      const userId = sub.metadata?.userId as string | undefined;
      const planId = (sub.metadata?.planId as PlanId) ?? "free";
      if (!userId) continue;

      let subMrr = 0;
      for (const item of sub.items.data) {
        if (item.deleted) continue;
        const price = item.price;
        if (!price?.unit_amount) continue;
        const amountCents = price.unit_amount;
        const interval = price.recurring?.interval;
        if (interval === "year") {
          subMrr += amountCents / 100 / 12;
        } else {
          subMrr += amountCents / 100;
        }
      }
      mrr += subMrr;
      if (planId !== "free") {
        subscriptionsByPlan[planId] = (subscriptionsByPlan[planId] ?? 0) + 1;
      }
    }

    // Stripe paginates; fetch more if needed
    let hasMore = subs.has_more;
    let lastId = subs.data[subs.data.length - 1]?.id;
    while (hasMore && lastId) {
      const next = await stripe.subscriptions.list({
        status: "active",
        expand: ["data.items.data.price"],
        limit: 100,
        starting_after: lastId,
      });
      for (const sub of next.data) {
        const planId = (sub.metadata?.planId as PlanId) ?? "free";
        let subMrr = 0;
        for (const item of sub.items.data) {
          if (item.deleted) continue;
          const price = item.price;
          if (!price?.unit_amount) continue;
          const amountCents = price.unit_amount;
          const interval = price.recurring?.interval;
          if (interval === "year") {
            subMrr += amountCents / 100 / 12;
          } else {
            subMrr += amountCents / 100;
          }
        }
        mrr += subMrr;
        if (planId !== "free") {
          subscriptionsByPlan[planId] =
            (subscriptionsByPlan[planId] ?? 0) + 1;
        }
      }
      hasMore = next.has_more;
      lastId = next.data[next.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[admin/overview] Stripe error:", err);
  }

  let estimatedInfraCost: number | null = null;
  let grossMarginPercent: number | null = null;

  if (isB2Configured()) {
    try {
      const bucketStats = await listBucketStats(undefined, 50_000);
      estimatedInfraCost = estimateB2StorageCost(bucketStats.totalBytes);
      if (mrr > 0 && estimatedInfraCost !== null) {
        grossMarginPercent = Math.round(((mrr - estimatedInfraCost) / mrr) * 100);
      }
    } catch (err) {
      console.warn("[admin/overview] B2 bucket stats failed:", err);
    }
  }

  return NextResponse.json({
    totalUsers,
    activeUsersToday,
    activeUsersMonth,
    newSignups: null,
    churnedUsers: null,
    totalStorageBytes,
    totalStorageAvailableBytes: null,
    avgStoragePerUserBytes,
    uploadsToday,
    downloadTrafficBytesToday: null,
    mrr: Math.round(mrr * 100) / 100,
    estimatedInfraCost,
    grossMarginPercent,
    supportTicketsOpen,
    criticalAlertsCount,
    lastSyncTimestamp: new Date().toISOString(),
    subscriptionsByPlan,
    payingUsers: payingProfiles.length,
    freeUsers,
  });
}
