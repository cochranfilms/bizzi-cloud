/**
 * Admin users service.
 * Fetches real users from /api/admin/users (Firestore profiles + Firebase Auth).
 */

import type { AdminUser } from "@/admin/types/adminUsers.types";

export interface UsersFilters {
  search?: string;
  plan?: string;
  status?: string;
  minStorage?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface FetchAdminUsersOptions {
  getToken?: () => Promise<string | null>;
}

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

export async function fetchAdminUsers(
  filters: UsersFilters = {},
  page = 1,
  limit = 25,
  options?: FetchAdminUsersOptions
): Promise<{ users: AdminUser[]; total: number }> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit),
  };
  if (filters.search) params.search = filters.search;
  if (filters.plan) params.plan = filters.plan;

  const data = await apiAdmin<{ users: AdminUser[]; total: number }>(
    "/api/admin/users",
    params,
    options?.getToken
  );
  return { users: data.users, total: data.total };
}
