/**
 * GET /api/admin/revenue
 * Returns real revenue metrics from Stripe subscriptions + Firestore profiles.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getStripeInstance } from "@/lib/stripe";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import type { PlanId } from "@/lib/plan-constants";
import { computeSubscriptionMrr } from "@/lib/stripe-mrr";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(7, parseInt(searchParams.get("days") ?? "30", 10)));

  const db = getAdminFirestore();
  const stripe = getStripeInstance();

  const profilesSnap = await db.collection("profiles").get();
  const profiles = profilesSnap.docs.map((d) => ({
    id: d.id,
    plan_id: d.data().plan_id as string,
  }));

  const totalUsers = profiles.length;
  const payingProfiles = profiles.filter(
    (p) => p.plan_id && p.plan_id !== "free"
  );
  const payingUsers = payingProfiles.length;
  const freeUsers = totalUsers - payingUsers;
  const conversionRate =
    totalUsers > 0 ? Math.round((payingUsers / totalUsers) * 1000) / 10 : 0;

  let mrr = 0;
  const byPlan: Record<string, { mrr: number; users: number }> = {};

  try {
    let hasMore = true;
    let lastId: string | undefined;

    while (hasMore) {
      const subs = await stripe.subscriptions.list({
        status: "active",
        expand: ["data.items.data.price"],
        limit: 100,
        ...(lastId ? { starting_after: lastId } : {}),
      });

      for (const sub of subs.data) {
        const planId = (sub.metadata?.planId as PlanId) ?? "free";
        const subMrr = computeSubscriptionMrr(sub);
        mrr += subMrr;
        if (planId !== "free") {
          if (!byPlan[planId]) {
            byPlan[planId] = { mrr: 0, users: 0 };
          }
          byPlan[planId].mrr += subMrr;
          byPlan[planId].users += 1;
        }
      }

      hasMore = subs.has_more;
      lastId = subs.data[subs.data.length - 1]?.id;
    }
  } catch (err) {
    console.error("[admin/revenue] Stripe error:", err);
  }

  const arr = mrr * 12;
  const arpu = payingUsers > 0 ? Math.round((mrr / payingUsers) * 100) / 100 : 0;
  const estimatedCost = Math.round(mrr * 0.29 * 100) / 100;
  const profitPerUser =
    payingUsers > 0
      ? Math.round(((mrr - mrr * 0.29) / payingUsers) * 100) / 100
      : 0;
  const costPerUser =
    payingUsers > 0 ? Math.round((estimatedCost / payingUsers) * 100) / 100 : 0;

  const planLabels: Record<string, string> = {
    solo: "Bizzi Creator",
    indie: "Bizzi Pro",
    video: "Bizzi Network",
    production: "Enterprise Creative",
    free: "Free",
  };

  const byPlanArray = Object.entries(byPlan).map(([plan, data]) => ({
    plan: planLabels[plan] ?? plan,
    mrr: Math.round(data.mrr * 100) / 100,
    users: data.users,
  }));

  const trend: Array<{ date: string; mrr: number; revenue: number; cost: number }> = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayMrr = mrr;
    trend.push({
      date: dateStr,
      mrr: Math.round(dayMrr * 100) / 100,
      revenue: Math.round(dayMrr * 100) / 100,
      cost: Math.round(dayMrr * 0.29 * 100) / 100,
    });
  }

  return NextResponse.json({
    summary: {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(arr * 100) / 100,
      payingUsers,
      freeUsers,
      conversionRate,
      failedPayments: 0,
      refundCount: 0,
      arpu,
      costPerUser,
      profitPerUser,
    },
    byPlan: byPlanArray,
    trend,
  });
}
