/**
 * Canonical lifecycle for backup_files.
 * Queries and counts use `lifecycle_state`; `deleted_at` is kept for audit and trash sort only.
 * `resolveBackupFileLifecycleState` still falls back to `deleted_at` for rows not yet backfilled.
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

const KNOWN: Set<string> = new Set([
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
  if (typeof ls === "string" && KNOWN.has(ls)) {
    return ls as BackupLifecycleState;
  }
  return deletedAtIsSet(data) ? BACKUP_LIFECYCLE_TRASHED : BACKUP_LIFECYCLE_ACTIVE;
}

/** Rows that should appear in normal “active” file listings (not trashed / purge buckets). */
export function isBackupFileActiveForListing(data: Record<string, unknown>): boolean {
  return resolveBackupFileLifecycleState(data) === BACKUP_LIFECYCLE_ACTIVE;
}

/** True when `lifecycle_state` is missing or not a known enum value (needs backfill for query alignment). */
export function backupFileNeedsLifecycleBackfill(data: Record<string, unknown>): boolean {
  const ls = data.lifecycle_state;
  return !(typeof ls === "string" && KNOWN.has(ls));
}
