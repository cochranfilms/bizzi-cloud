/**
 * Admin alerts service.
 * Fetches real derived alerts from /api/admin/alerts (storage limits, Stripe past_due).
 */

import type { AdminAlert } from "@/admin/types/adminAlerts.types";

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

export interface FetchAlertsOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchAlerts(
  filters?: { severity?: string; limit?: number },
  options?: FetchAlertsOptions
): Promise<AdminAlert[]> {
  const params: Record<string, string> = {};
  if (filters?.severity) params.severity = filters.severity;
  if (filters?.limit) params.limit = String(filters.limit);
  const data = await apiAdmin<AdminAlert[]>("/api/admin/alerts", params, options?.getToken);
  return Array.isArray(data) ? data : [];
}
