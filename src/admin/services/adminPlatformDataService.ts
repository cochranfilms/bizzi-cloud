/**
 * Admin Platform data hub — workspaces, shares, activity_logs.
 */

import type {
  AdminActivityRow,
  AdminShareRow,
  AdminWorkspaceRow,
  PlatformSummary,
} from "@/admin/types/adminPlatformData.types";

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

export interface FetchPlatformOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchPlatformSummary(
  options?: FetchPlatformOptions
): Promise<PlatformSummary> {
  return apiAdmin<PlatformSummary>("/api/admin/platform-data/summary", options?.getToken);
}

export async function fetchPlatformWorkspaces(
  params: {
    page?: number;
    limit?: number;
    organizationId?: string;
    workspaceType?: string;
    q?: string;
  },
  options?: FetchPlatformOptions
): Promise<{ workspaces: AdminWorkspaceRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set("page", String(params.page));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.organizationId) sp.set("organizationId", params.organizationId);
  if (params.workspaceType) sp.set("workspaceType", params.workspaceType);
  if (params.q) sp.set("q", params.q);
  const q = sp.toString();
  return apiAdmin(`/api/admin/platform-data/workspaces${q ? `?${q}` : ""}`, options?.getToken);
}

export async function fetchPlatformShares(
  params: {
    page?: number;
    limit?: number;
    ownerId?: string;
    recipientMode?: string;
    q?: string;
    hideExpired?: boolean;
  },
  options?: FetchPlatformOptions
): Promise<{ shares: AdminShareRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set("page", String(params.page));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.ownerId) sp.set("ownerId", params.ownerId);
  if (params.recipientMode) sp.set("recipientMode", params.recipientMode);
  if (params.q) sp.set("q", params.q);
  if (params.hideExpired) sp.set("hideExpired", "1");
  const q = sp.toString();
  return apiAdmin(`/api/admin/platform-data/shares${q ? `?${q}` : ""}`, options?.getToken);
}

export async function fetchPlatformActivity(
  params: {
    page?: number;
    limit?: number;
    actorUserId?: string;
    eventType?: string;
    scopeType?: string;
    organizationId?: string;
    q?: string;
  },
  options?: FetchPlatformOptions
): Promise<{ events: AdminActivityRow[]; total: number; page: number; limit: number }> {
  const sp = new URLSearchParams();
  if (params.page != null) sp.set("page", String(params.page));
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.actorUserId) sp.set("actorUserId", params.actorUserId);
  if (params.eventType) sp.set("eventType", params.eventType);
  if (params.scopeType) sp.set("scopeType", params.scopeType);
  if (params.organizationId) sp.set("organizationId", params.organizationId);
  if (params.q) sp.set("q", params.q);
  const q = sp.toString();
  return apiAdmin(`/api/admin/platform-data/activity${q ? `?${q}` : ""}`, options?.getToken);
}
