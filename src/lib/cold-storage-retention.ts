/**
 * Cold storage retention days by plan tier.
 * Used when migrating files to cold storage; determines cold_storage_expires_at.
 */
export const COLD_STORAGE_RETENTION_DAYS: Record<string, number> = {
  solo: 45, // Bizzi Creator
  indie: 60, // Bizzi Pro
  video: 90, // Bizzi Network
  production: 180, // We Bizzi
  enterprise: 180, // Enterprise orgs (admin + seat members)
};

/** Retention for account_delete source type (user explicitly deleted account). */
export const ACCOUNT_DELETE_RETENTION_DAYS = 30;

/** Days before cold storage migration after first payment failure. */
export const GRACE_PERIOD_DAYS = 7;

export type ColdStorageSourceType =
  | "org_removal"
  | "subscription_end"
  | "account_delete"
  | "payment_failed";

export function getRetentionDays(
  planTier: string,
  sourceType: ColdStorageSourceType
): number {
  if (sourceType === "account_delete") {
    return ACCOUNT_DELETE_RETENTION_DAYS;
  }
  return COLD_STORAGE_RETENTION_DAYS[planTier] ?? COLD_STORAGE_RETENTION_DAYS.enterprise;
}
