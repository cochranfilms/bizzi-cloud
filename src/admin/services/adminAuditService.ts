/**
 * Admin audit service.
 * Fetches real audit entries from /api/admin/audit (Firestore admin_audit_log).
 */

import type { AuditLogEntry } from "@/admin/types/adminAudit.types";

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

export interface FetchAuditOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchAuditLog(
  filters?: { action?: string; actorId?: string },
  page = 1,
  limit = 50,
  options?: FetchAuditOptions
): Promise<{ entries: AuditLogEntry[]; total: number }> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit),
  };
  if (filters?.action) params.action = filters.action;
  if (filters?.actorId) params.actorId = filters.actorId;

  const data = await apiAdmin<{ entries: AuditLogEntry[]; total: number }>(
    "/api/admin/audit",
    params,
    options?.getToken
  );
  return { entries: data.entries, total: data.total };
}
