/**
 * Admin files service.
 * Fetches real files from /api/admin/files (Firestore backup_files).
 */

import type { AdminFile } from "@/admin/types/adminFiles.types";

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

export interface FilesFilters {
  search?: string;
  ownerId?: string;
  status?: string;
  extension?: string;
}

export interface FetchFilesOptions {
  getToken?: () => Promise<string | null>;
}

export async function fetchAdminFiles(
  filters: FilesFilters = {},
  page = 1,
  limit = 25,
  options?: FetchFilesOptions
): Promise<{ files: AdminFile[]; total: number }> {
  const params: Record<string, string> = {
    page: String(page),
    limit: String(limit),
  };
  if (filters.ownerId) params.ownerId = filters.ownerId;

  const data = await apiAdmin<{ files: AdminFile[]; total: number }>(
    "/api/admin/files",
    params,
    options?.getToken
  );
  return { files: data.files, total: data.total };
}

export async function fetchLargeFiles(
  limit = 10,
  options?: FetchFilesOptions
): Promise<AdminFile[]> {
  const { files } = await fetchAdminFiles({}, 1, 200, options);
  return files
    .filter((f) => f.sizeBytes > 500 * 1024 * 1024)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, limit);
}
