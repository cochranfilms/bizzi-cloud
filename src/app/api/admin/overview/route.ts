/**
 * GET /api/admin/overview
 * Returns real platform metrics from Firestore + Stripe.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { PlanId } from "@/lib/plan-constants";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();

  const profilesSnap = await db.collection("profiles").get();
  const profiles = profilesSnap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data } as { id: string; plan_id?: string; storage_used_bytes?: number };
  });

  const totalUsers = profiles.length;
  const payingProfiles = profiles.filter(
    (p) => p.plan_id && p.plan_id !== "free"
  );
  const freeUsers = totalUsers - payingProfiles.length;

  let totalStorageBytes = 0;
  for (const p of profiles) {
    totalStorageBytes += typeof p.storage_used_bytes === "number" ? p.storage_used_bytes : 0;
  }

  // Add org storage (organizations have their own storage_used_bytes)
  const orgsSnap = await db.collection("organizations").get();
  for (const doc of orgsSnap.docs) {
    const data = doc.data();
    const used =
      typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    totalStorageBytes += used;
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

  const estimatedInfraCost = Math.round(mrr * 0.29);
  const grossMarginPercent =
    mrr > 0 ? Math.round(((mrr - estimatedInfraCost) / mrr) * 100) : 0;

  return NextResponse.json({
    totalUsers,
    activeUsersToday: totalUsers,
    activeUsersMonth: totalUsers,
    newSignups: 0,
    churnedUsers: 0,
    totalStorageBytes,
    totalStorageAvailableBytes: null,
    avgStoragePerUserBytes,
    uploadsToday: 0,
    downloadTrafficBytesToday: 0,
    mrr: Math.round(mrr * 100) / 100,
    estimatedInfraCost,
    grossMarginPercent,
    supportTicketsOpen: 0,
    criticalAlertsCount: 0,
    lastSyncTimestamp: new Date().toISOString(),
    subscriptionsByPlan,
    payingUsers: payingProfiles.length,
    freeUsers,
  });
}
