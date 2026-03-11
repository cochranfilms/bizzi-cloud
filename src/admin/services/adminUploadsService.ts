/**
 * Admin upload analytics service.
 * Fetches real upload data from /api/admin/uploads (Firestore upload_sessions).
 */

import type {
  UploadMetrics,
  UploadVolumePoint,
  UploadFailureReason,
} from "@/admin/types/adminUploads.types";

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
  const res = await fetch(url.toString(), {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface FetchUploadsOptions {
  getToken?: () => Promise<string | null>;
}

export interface UploadAnalyticsData {
  metrics: UploadMetrics;
  volume: UploadVolumePoint[];
  failures: UploadFailureReason[];
}

/** Single fetch for all upload analytics - ensures consistent real-time snapshot */
export async function fetchUploadAnalytics(
  days = 14,
  options?: FetchUploadsOptions
): Promise<UploadAnalyticsData> {
  const data = await apiAdmin<UploadAnalyticsData>(
    "/api/admin/uploads",
    { days: String(days) },
    options?.getToken
  );
  return data;
}

export async function fetchUploadMetrics(
  options?: FetchUploadsOptions
): Promise<UploadMetrics> {
  const data = await apiAdmin<{ metrics: UploadMetrics }>(
    "/api/admin/uploads",
    { days: "14" },
    options?.getToken
  );
  return data.metrics;
}

export async function fetchUploadVolume(
  days = 14,
  options?: FetchUploadsOptions
): Promise<UploadVolumePoint[]> {
  const data = await apiAdmin<{ volume: UploadVolumePoint[] }>(
    "/api/admin/uploads",
    { days: String(days) },
    options?.getToken
  );
  return data.volume;
}

export async function fetchUploadFailures(
  options?: FetchUploadsOptions
): Promise<UploadFailureReason[]> {
  const data = await apiAdmin<{ failures: UploadFailureReason[] }>(
    "/api/admin/uploads",
    { days: "14" },
    options?.getToken
  );
  return data.failures;
}
