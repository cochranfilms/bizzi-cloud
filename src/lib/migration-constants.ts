/** Firestore collection names for cloud import / migration (Phase 1). */
export const MIGRATION_PROVIDER_ACCOUNTS_COLLECTION = "migration_provider_accounts";
export const MIGRATION_JOBS_COLLECTION = "migration_jobs";
export const MIGRATION_FILES_SUBCOLLECTION = "files";
export const MIGRATION_OAUTH_STATES_COLLECTION = "migration_oauth_states";

export type MigrationProvider = "google_drive" | "dropbox";

export type MigrationJobStatus =
  | "queued"
  | "scanning"
  | "scan_completed"
  | "blocked_quota"
  | "blocked_destination_invalid"
  | "ready"
  | "running"
  | "paused"
  | "completed"
  | "completed_with_issues"
  | "failed"
  | "canceled";

/** Per-file / scan classification for reports and UI. */
export type MigrationUnsupportedReason =
  | "supported"
  | "unsupported_provider_native"
  | "unsupported_shortcut"
  | "permission_denied_source"
  | "file_too_large_for_phase1"
  | "export_not_supported"
  | "malware_or_abuse_locked"
  | "unknown_provider_object";

export type MigrationDuplicateMode = "skip" | "rename";

export type MigrationFileTransferStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "failed";

export type MigrationVerificationOutcome = "none" | "size_ok" | "checksum_ok" | "checksum_mismatch";

export function migrationMaxFileBytes(): number {
  const raw = process.env.MIGRATION_MAX_FILE_BYTES?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  /** Default 200 GiB — worker streams multipart; tune per infra. */
  return 200 * 1024 * 1024 * 1024;
}

export function migrationMaxFoldersPerJob(): number {
  const raw = process.env.MIGRATION_MAX_FOLDERS_PER_JOB?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 200;
}

export function migrationMaxFilesPerJob(): number {
  const raw = process.env.MIGRATION_MAX_FILES_PER_JOB?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 500_000;
}

export function migrationMaxConcurrentJobsPerUser(): number {
  const raw = process.env.MIGRATION_MAX_CONCURRENT_JOBS_PER_USER?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 2;
}

export function migrationMaxConcurrentJobsPerWorkspace(): number {
  const raw = process.env.MIGRATION_MAX_CONCURRENT_JOBS_PER_WORKSPACE?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 2;
}

export function migrationMaxRetriesPerFile(): number {
  const raw = process.env.MIGRATION_MAX_RETRIES_PER_FILE?.trim();
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 8;
}

/** If unsupported rows / discovered rows exceeds this ratio, set warning on job (still allow ready if product allows). */
export function migrationUnsupportedRatioWarning(): number {
  const raw = process.env.MIGRATION_UNSUPPORTED_RATIO_WARN?.trim();
  if (raw && /^\d*\.?\d+$/.test(raw)) return Math.min(1, Math.max(0, parseFloat(raw)));
  return 0.85;
}
