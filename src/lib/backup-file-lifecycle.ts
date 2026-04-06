/**
 * Canonical lifecycle for backup_files.
 * Queries and counts use `lifecycle_state`; `deleted_at` is kept for audit and trash sort only.
 * `resolveBackupFileLifecycleState` still falls back to `deleted_at` for rows not yet backfilled.
 *
 * Listing vs quota: `isBackupFileActiveForListing` and `isBackupFileCountedTowardStorageQuota` intentionally
 * diverge for unknown / malformed `lifecycle_string` values — see JSDoc on each.
 */

export const BACKUP_LIFECYCLE_ACTIVE = "active";
export const BACKUP_LIFECYCLE_TRASHED = "trashed";
export const BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE = "pending_permanent_delete";
export const BACKUP_LIFECYCLE_PERMANENTLY_DELETED = "permanently_deleted";
export const BACKUP_LIFECYCLE_DELETE_FAILED = "delete_failed";

export type BackupLifecycleState =
  | typeof BACKUP_LIFECYCLE_ACTIVE
  | typeof BACKUP_LIFECYCLE_TRASHED
  | typeof BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE
  | typeof BACKUP_LIFECYCLE_PERMANENTLY_DELETED
  | typeof BACKUP_LIFECYCLE_DELETE_FAILED;

/** Single source of truth for known enum strings — use everywhere (resolve, listing, backfill, tests). */
export const KNOWN_BACKUP_LIFECYCLE_STATES: ReadonlySet<string> = new Set([
  BACKUP_LIFECYCLE_ACTIVE,
  BACKUP_LIFECYCLE_TRASHED,
  BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
  BACKUP_LIFECYCLE_PERMANENTLY_DELETED,
  BACKUP_LIFECYCLE_DELETE_FAILED,
]);

function deletedAtIsSet(data: Record<string, unknown>): boolean {
  const d = data.deleted_at;
  return d != null && d !== false;
}

/**
 * Prefer explicit lifecycle_state; fall back to deleted_at for legacy rows without lifecycle_state.
 */
export function resolveBackupFileLifecycleState(data: Record<string, unknown>): BackupLifecycleState {
  const ls = data.lifecycle_state;
  if (typeof ls === "string" && KNOWN_BACKUP_LIFECYCLE_STATES.has(ls)) {
    return ls as BackupLifecycleState;
  }
  return deletedAtIsSet(data) ? BACKUP_LIFECYCLE_TRASHED : BACKUP_LIFECYCLE_ACTIVE;
}

/**
 * Rows shown in normal “active” file listings. Non-KNOWN string lifecycle values are hidden (fail-safe)
 * even when `deleted_at` is unset; quota may still count those bytes via `quotaCountedSizeBytesFromBackupFile`.
 */
export function isBackupFileActiveForListing(data: Record<string, unknown>): boolean {
  const ls = data.lifecycle_state;
  if (typeof ls === "string" && !KNOWN_BACKUP_LIFECYCLE_STATES.has(ls)) {
    return false;
  }
  return resolveBackupFileLifecycleState(data) === BACKUP_LIFECYCLE_ACTIVE;
}

/** True when `lifecycle_state` is missing or not a known enum value (needs backfill for query alignment). */
export function backupFileNeedsLifecycleBackfill(data: Record<string, unknown>): boolean {
  const ls = data.lifecycle_state;
  return !(typeof ls === "string" && KNOWN_BACKUP_LIFECYCLE_STATES.has(ls));
}

/**
 * Gallery Media “Add from files” rows set `reference_source_backup_file_id` to the canonical backup_files id
 * and reuse `object_key` / mirrored `size_bytes` without a second B2 object — they must not double-count quota.
 */
export function isBackupFileReferencePointerRow(data: Record<string, unknown>): boolean {
  const ref = data.reference_source_backup_file_id;
  return typeof ref === "string" && ref.trim().length > 0;
}

/**
 * Byte weight toward storage quota for one document. Canonical rule: any existing row with positive numeric
 * `size_bytes` counts unless `lifecycle_state` is an explicitly terminal, non billable state
 * (`permanently_deleted` today), or the row is a {@link isBackupFileReferencePointerRow}.
 * Unknown/malformed lifecycle still counts when `size_bytes` is positive.
 * Not for UI listing or download gates — use `isBackupFileActiveForListing` there.
 */
export function quotaCountedSizeBytesFromBackupFile(data: Record<string, unknown>): number {
  const n = data.size_bytes;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) {
    return 0;
  }
  if (isBackupFileReferencePointerRow(data)) {
    return 0;
  }
  if (data.lifecycle_state === BACKUP_LIFECYCLE_PERMANENTLY_DELETED) {
    return 0;
  }
  return n;
}

/** True when this document contributes positive bytes to quota (see `quotaCountedSizeBytesFromBackupFile`). */
export function isBackupFileCountedTowardStorageQuota(data: Record<string, unknown>): boolean {
  return quotaCountedSizeBytesFromBackupFile(data) > 0;
}
