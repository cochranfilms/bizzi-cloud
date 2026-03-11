/**
 * Admin support service.
 * Fetches real support tickets from /api/admin/support (Firestore support_tickets).
 */

import type { SupportTicket } from "@/admin/types/adminSupport.types";

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

export interface FetchSupportOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchSupportTickets(
  filters?: { status?: string; priority?: string },
  page = 1,
  limit = 25,
  options?: FetchSupportOptions
): Promise<{ tickets: SupportTicket[]; total: number }> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit),
  };
  if (filters?.status) params.status = filters.status;
  if (filters?.priority) params.priority = filters.priority;

  const data = await apiAdmin<{ tickets: SupportTicket[]; total: number }>(
    "/api/admin/support",
    params,
    options?.getToken
  );
  return { tickets: data.tickets, total: data.total };
}

export async function fetchSupportIssueBreakdown(
  options?: FetchSupportOptions
): Promise<Record<string, number>> {
  const data = await apiAdmin<{ breakdown: Record<string, number> }>(
    "/api/admin/support",
    { page: "1", limit: "1" },
    options?.getToken
  );
  return data.breakdown ?? {};
}
