/**
 * Admin overview service.
 * Fetches real metrics from /api/admin/overview (Firestore + Stripe).
 */

import type {
  OverviewMetrics,
  PlatformHealthCheck,
  CriticalAlert,
  TopAccount,
} from "@/admin/types/adminOverview.types";

async function apiAdmin<T>(
  path: string,
  getToken?: () => Promise<string | null>
): Promise<T> {
  const url = path.startsWith("/") ? `${typeof window !== "undefined" ? window.location.origin : ""}${path}` : path;
  const headers: Record<string, string> = {};
  if (getToken) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface FetchOverviewOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchOverviewMetrics(
  options?: FetchOverviewOptions
): Promise<OverviewMetrics> {
  const data = await apiAdmin<OverviewMetrics>("/api/admin/overview", options?.getToken);
  return data;
}

export async function fetchPlatformHealth(
  options?: FetchOverviewOptions
): Promise<PlatformHealthCheck[]> {
  try {
    const data = await apiAdmin<{ checks: PlatformHealthCheck[] }>(
      "/api/admin/health",
      options?.getToken
    );
    return data.checks ?? [];
  } catch {
    return [];
  }
}

export async function fetchCriticalAlerts(
  options?: FetchOverviewOptions
): Promise<CriticalAlert[]> {
  try {
    const data = await apiAdmin<Array<{
      id: string;
      severity: "critical" | "warning";
      title: string;
      source: string;
      timestamp: string;
      recommendedAction?: string;
    }>>(
      "/api/admin/alerts?severity=critical,warning&limit=5",
      options?.getToken
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function fetchTopAccounts(
  options?: FetchOverviewOptions
): Promise<TopAccount[]> {
  const data = await apiAdmin<{ accounts: TopAccount[] }>(
    "/api/admin/top-accounts?limit=10",
    options?.getToken
  );
  return data.accounts;
}
