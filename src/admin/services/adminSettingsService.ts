/**
 * Admin settings service.
 * Fetches real settings from /api/admin/settings (plan-constants + Firestore admin_settings).
 */

import type {
  QuotaSettings,
  RetentionSettings,
  AlertThresholdSettings,
  FeatureFlags,
  MaintenanceSettings,
  BannerSettings,
} from "@/admin/types/adminSettings.types";

async function apiAdmin<T>(
  path: string,
  getToken?: () => Promise<string | null>
): Promise<T> {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
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

export interface FetchSettingsOptions {
  getToken?: () => Promise<string | null>;
}

export type SettingsResponse = {
  quotas: QuotaSettings;
  retention: RetentionSettings;
  alerts: AlertThresholdSettings;
  features: FeatureFlags;
  maintenance: MaintenanceSettings;
  banner: BannerSettings;
};

export async function fetchAllSettings(options?: FetchSettingsOptions): Promise<SettingsResponse> {
  return apiAdmin<SettingsResponse>("/api/admin/settings", options?.getToken);
}

export async function fetchQuotaSettings(options?: FetchSettingsOptions): Promise<QuotaSettings> {
  const data = await fetchAllSettings(options);
  return data.quotas;
}

export async function fetchRetentionSettings(options?: FetchSettingsOptions): Promise<RetentionSettings> {
  const data = await fetchAllSettings(options);
  return data.retention;
}

export async function fetchAlertThresholdSettings(options?: FetchSettingsOptions): Promise<AlertThresholdSettings> {
  const data = await fetchAllSettings(options);
  return data.alerts;
}

export async function fetchFeatureFlags(options?: FetchSettingsOptions): Promise<FeatureFlags> {
  const data = await fetchAllSettings(options);
  return data.features;
}

export async function fetchMaintenanceSettings(options?: FetchSettingsOptions): Promise<MaintenanceSettings> {
  const data = await fetchAllSettings(options);
  return data.maintenance;
}

export async function fetchBannerSettings(options?: FetchSettingsOptions): Promise<BannerSettings> {
  const data = await fetchAllSettings(options);
  return data.banner;
}
