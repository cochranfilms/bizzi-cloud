/**
 * Admin revenue service.
 * Fetches real revenue from /api/admin/revenue (Stripe subscriptions).
 */

import type { RevenueByPlan, RevenueDataPoint } from "@/admin/types/adminRevenue.types";

async function apiAdmin<T>(
  path: string,
  params: Record<string, string> = {},
  getToken?: () => Promise<string | null>
): Promise<T> {
  const url = new URL(path, typeof window !== "undefined" ? window.location.origin : "");
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  });
  const headers: Record<string, string> = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url.toString(), { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface FetchRevenueOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchRevenueSummary(options?: FetchRevenueOptions) {
  const data = await apiAdmin<{ summary: Record<string, number | undefined> }>(
    "/api/admin/revenue",
    { days: "30" },
    options?.getToken
  );
  return data.summary;
}

export async function fetchRevenueByPlan(
  options?: FetchRevenueOptions
): Promise<RevenueByPlan[]> {
  const data = await apiAdmin<{ byPlan: RevenueByPlan[] }>(
    "/api/admin/revenue",
    { days: "30" },
    options?.getToken
  );
  return data.byPlan;
}

export async function fetchRevenueTrend(
  days = 30,
  options?: FetchRevenueOptions
): Promise<RevenueDataPoint[]> {
  const data = await apiAdmin<{ trend: RevenueDataPoint[] }>(
    "/api/admin/revenue",
    { days: String(days) },
    options?.getToken
  );
  return data.trend;
}
