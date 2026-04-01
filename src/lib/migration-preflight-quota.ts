import { getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { sumPendingReservationBytes } from "@/lib/storage-quota-reservations";
import type { MigrationDestinationContract } from "@/lib/migration-destination";

export interface PreflightQuotaResult {
  ok: boolean;
  code?: "blocked_quota";
  estimated_supported_bytes: number;
  remaining_bytes: number | null;
  quota_bytes: number | null;
  file_used_bytes: number;
  reserved_bytes: number;
}

export async function runMigrationPreflightQuota(
  contract: MigrationDestinationContract,
  estimatedSupportedBytes: number
): Promise<PreflightQuotaResult> {
  const uid = contract.path_subject_uid;
  const driveId = contract.linked_drive_id;
  const snap = await getUploadBillingSnapshot(uid, driveId);
  const reserved = await sumPendingReservationBytes(snap.billing_key);
  const effectiveUsed = snap.file_used_bytes + reserved;
  const quota = snap.quota_bytes;

  if (quota === null) {
    return {
      ok: true,
      estimated_supported_bytes: estimatedSupportedBytes,
      remaining_bytes: null,
      quota_bytes: null,
      file_used_bytes: snap.file_used_bytes,
      reserved_bytes: reserved,
    };
  }

  const remaining = Math.max(0, quota - effectiveUsed);
  if (estimatedSupportedBytes > remaining) {
    return {
      ok: false,
      code: "blocked_quota",
      estimated_supported_bytes: estimatedSupportedBytes,
      remaining_bytes: remaining,
      quota_bytes: quota,
      file_used_bytes: snap.file_used_bytes,
      reserved_bytes: reserved,
    };
  }

  return {
    ok: true,
    estimated_supported_bytes: estimatedSupportedBytes,
    remaining_bytes: remaining,
    quota_bytes: quota,
    file_used_bytes: snap.file_used_bytes,
    reserved_bytes: reserved,
  };
}
