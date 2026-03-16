/**
 * Admin settings types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface QuotaSettings {
  freeStorageBytes: number;
  starterStorageBytes: number;
  proStorageBytes: number;
  businessStorageBytes: number;
  enterpriseStorageBytes: number | null;
  maxUploadBytes: number;
}

export interface RetentionSettings {
  trashRetentionDays: number;
  archiveAfterInactiveDays: number | null;
  permanentDeleteAfterDays: number | null;
}

export interface AlertThresholdSettings {
  errorRateWarningPercent: number;
  errorRateCriticalPercent: number;
  uploadFailureWarningCount: number;
  queueBacklogWarning: number;
}

export interface FeatureFlags {
  [key: string]: boolean;
}

export interface MaintenanceSettings {
  enabled: boolean;
  message: string;
}

export interface BannerSettings {
  enabled: boolean;
  message: string;
  severity: "info" | "warning" | "critical";
}

/** Display preferences for admin dashboard (locale, currency). */
export interface DisplaySettings {
  locale: string;
  currency: string;
}
