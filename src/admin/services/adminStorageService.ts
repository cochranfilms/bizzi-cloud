/**
 * Admin storage service.
 * Fetches real storage from /api/admin/storage (Firestore profiles, organizations, backup_files).
 */

import type { StorageCategory, StorageAccount } from "@/admin/types/adminStorage.types";

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

export interface FetchStorageOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchStorageSummary(
  options?: FetchStorageOptions
): Promise<{
  totalBytes: number;
  quotaBytes: number | null;
  byCategory: StorageCategory[];
}> {
  const data = await apiAdmin<{
    totalBytes: number;
    quotaBytes: number | null;
    byCategory: Array<{ id: string; label: string; bytes: number; percent: number }>;
  }>("/api/admin/storage", { limit: "10" }, options?.getToken);
  return {
    totalBytes: data.totalBytes,
    quotaBytes: data.quotaBytes,
    byCategory: data.byCategory.map((c) => ({
      id: c.id,
      label: c.label,
      bytes: c.bytes,
      percent: c.percent,
    })),
  };
}

export async function fetchLargestAccounts(
  limit = 10,
  options?: FetchStorageOptions
): Promise<StorageAccount[]> {
  const data = await apiAdmin<{ largestAccounts: StorageAccount[] }>(
    "/api/admin/storage",
    { limit: String(limit) },
    options?.getToken
  );
  return data.largestAccounts;
}
