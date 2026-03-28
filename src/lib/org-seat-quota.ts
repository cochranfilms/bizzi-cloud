/**
 * Seat-level quota policy for enterprise uploads (server).
 */

import type { OrganizationSeatQuotaMode } from "@/lib/enterprise-constants";

export function quotaModeFromSeatData(
  data: Record<string, unknown> | undefined
): OrganizationSeatQuotaMode {
  if (!data) return "org_unlimited";
  const raw = data.quota_mode as string | undefined;
  if (raw === "fixed" || raw === "org_unlimited") return raw;
  const bytes = data.storage_quota_bytes;
  if (typeof bytes === "number") return "fixed";
  return "org_unlimited";
}

/** Numeric cap for enforcement, or null when only the org pool applies for this seat. */
export function seatNumericCapForEnforcement(data: Record<string, unknown> | undefined): number | null {
  if (!data) return null;
  const mode = quotaModeFromSeatData(data);
  if (mode === "org_unlimited") return null;
  const bytes = data.storage_quota_bytes;
  return typeof bytes === "number" ? bytes : null;
}
