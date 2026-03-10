/**
 * Admin settings service.
 * TODO: Replace with real API: fetch('/api/admin/settings', { ... })
 */

import type {
  QuotaSettings,
  RetentionSettings,
  AlertThresholdSettings,
  FeatureFlags,
  MaintenanceSettings,
  BannerSettings,
} from "@/admin/types/adminSettings.types";

const STORAGE_1TB = 1024 ** 4;
const STORAGE_100GB = 100 * 1024 ** 3;
const STORAGE_10GB = 10 * 1024 ** 3;
const STORAGE_5GB = 5 * 1024 ** 3;
const UPLOAD_5GB = 5 * 1024 ** 3;

export async function fetchQuotaSettings(): Promise<QuotaSettings> {
  await new Promise((r) => setTimeout(r, 300));
  return {
    freeStorageBytes: STORAGE_5GB,
    starterStorageBytes: 50 * 1024 ** 3,
    proStorageBytes: STORAGE_100GB,
    businessStorageBytes: 500 * 1024 ** 3,
    enterpriseStorageBytes: null,
    maxUploadBytes: UPLOAD_5GB,
  };
}

export async function fetchRetentionSettings(): Promise<RetentionSettings> {
  await new Promise((r) => setTimeout(r, 200));
  return {
    trashRetentionDays: 30,
    archiveAfterInactiveDays: 365,
    permanentDeleteAfterDays: null,
  };
}

export async function fetchAlertThresholdSettings(): Promise<AlertThresholdSettings> {
  await new Promise((r) => setTimeout(r, 200));
  return {
    errorRateWarningPercent: 5,
    errorRateCriticalPercent: 10,
    uploadFailureWarningCount: 100,
    queueBacklogWarning: 500,
  };
}

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  await new Promise((r) => setTimeout(r, 200));
  return {
    newGalleryUI: true,
    videoPreviews: true,
    bulkDownload: true,
    transferPasswordOptional: false,
    maintenanceMode: false,
  };
}

export async function fetchMaintenanceSettings(): Promise<MaintenanceSettings> {
  await new Promise((r) => setTimeout(r, 150));
  return {
    enabled: false,
    message: "We're performing scheduled maintenance. Expected completion: 2 hours.",
  };
}

export async function fetchBannerSettings(): Promise<BannerSettings> {
  await new Promise((r) => setTimeout(r, 150));
  return {
    enabled: false,
    message: "",
    severity: "info",
  };
}
