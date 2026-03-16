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
  DisplaySettings,
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
  display?: DisplaySettings;
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

/** Partial update payload for PATCH - any subset of settings sections */
export type SettingsUpdatePayload = {
  display?: Partial<DisplaySettings>;
  quotas?: Partial<QuotaSettings>;
  retention?: Partial<RetentionSettings>;
  alerts?: Partial<AlertThresholdSettings>;
  features?: Partial<FeatureFlags>;
  maintenance?: Partial<MaintenanceSettings>;
  banner?: Partial<BannerSettings>;
};

async function apiAdminMutation<T>(
  path: string,
  method: "PATCH",
  body: unknown,
  getToken?: () => Promise<string | null>
): Promise<T> {
  const url = `${typeof window !== "undefined" ? window.location.origin : ""}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (getToken) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function updateAdminSettings(
  payload: SettingsUpdatePayload,
  options?: FetchSettingsOptions
): Promise<{ ok: boolean }> {
  return apiAdminMutation<{ ok: boolean }>("/api/admin/settings", "PATCH", payload, options?.getToken);
}
