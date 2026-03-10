/**
 * Admin revenue service.
 * TODO: Replace with real API calls.
 */

import type { RevenueByPlan, RevenueDataPoint } from "@/admin/types/adminRevenue.types";

export async function fetchRevenueSummary() {
  await new Promise((r) => setTimeout(r, 300));
  return {
    mrr: 42800,
    arr: 513600,
    payingUsers: 312,
    freeUsers: 935,
    trialUsers: 47,
    conversionRate: 12.4,
    failedPayments: 8,
    refundCount: 3,
    arpu: 137,
    costPerUser: 42,
    profitPerUser: 95,
  };
}

export async function fetchRevenueByPlan(): Promise<RevenueByPlan[]> {
  await new Promise((r) => setTimeout(r, 200));
  return [
    { plan: "Enterprise", mrr: 18500, users: 12 },
    { plan: "Business", mrr: 14200, users: 45 },
    { plan: "Pro", mrr: 8900, users: 178 },
    { plan: "Starter", mrr: 1200, users: 77 },
  ];
}

export async function fetchRevenueTrend(days = 30): Promise<RevenueDataPoint[]> {
  await new Promise((r) => setTimeout(r, 250));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const base = 38000 + i * 150;
    return {
      date: d.toISOString().slice(0, 10),
      mrr: base + Math.random() * 1000,
      revenue: base * 1.02,
      cost: base * 0.28,
    };
  });
}
