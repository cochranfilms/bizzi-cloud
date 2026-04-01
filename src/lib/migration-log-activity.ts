/**
 * Fire-and-forget activity logging for cloud import / migration (audit + support).
 */
import { logActivityEvent, type ActivityScopeType } from "@/lib/activity-log";
import type { MigrationDestinationContract } from "@/lib/migration-destination";
import type { MigrationProvider } from "@/lib/migration-constants";

export function migrationActivityBase(contract: MigrationDestinationContract): {
  scope_type: ActivityScopeType;
  organization_id: string | null;
  workspace_id: string | null;
  workspace_type: string | null;
  linked_drive_id: string;
  drive_type: "storage";
} {
  return {
    scope_type: contract.organization_id ? "organization" : "personal_account",
    organization_id: contract.organization_id,
    workspace_id: contract.workspace_id,
    workspace_type: contract.workspace_scope,
    linked_drive_id: contract.linked_drive_id,
    drive_type: "storage",
  };
}

export function logMigrationJobCreated(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string,
  provider: string
): void {
  void logActivityEvent({
    event_type: "migration_job_created",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId, provider },
  });
}

export function logMigrationJobScanCompleted(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string,
  detail: {
    status: string;
    files_supported_count: number;
    files_unsupported_count: number;
    preflight_ok: boolean;
  }
): void {
  void logActivityEvent({
    event_type: "migration_job_scan_completed",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId, ...detail },
  });
}

export function logMigrationTransferStarted(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string
): void {
  void logActivityEvent({
    event_type: "migration_transfer_started",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId },
  });
}

export function logMigrationJobPaused(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string,
  previousStatus: string
): void {
  void logActivityEvent({
    event_type: "migration_job_paused",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId, previous_status: previousStatus },
  });
}

export function logMigrationJobResumed(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string,
  restoredStatus: string
): void {
  void logActivityEvent({
    event_type: "migration_job_resumed",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId, restored_status: restoredStatus },
  });
}

export function logMigrationJobCompleted(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string
): void {
  void logActivityEvent({
    event_type: "migration_job_completed",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId },
  });
}

export function logMigrationJobFailed(
  uid: string,
  contract: MigrationDestinationContract,
  jobId: string,
  detail: { failure_code: string; failure_message: string; status: string }
): void {
  void logActivityEvent({
    event_type: "migration_job_failed",
    actor_user_id: uid,
    ...migrationActivityBase(contract),
    metadata: { job_id: jobId, ...detail },
  });
}

export function logMigrationProviderConnected(uid: string, provider: MigrationProvider): void {
  void logActivityEvent({
    event_type: "migration_provider_connected",
    actor_user_id: uid,
    scope_type: "personal_account",
    organization_id: null,
    workspace_id: null,
    workspace_type: null,
    linked_drive_id: null,
    drive_type: null,
    metadata: { provider },
  });
}

export function logMigrationProviderDisconnected(uid: string, provider: MigrationProvider): void {
  void logActivityEvent({
    event_type: "migration_provider_disconnected",
    actor_user_id: uid,
    scope_type: "personal_account",
    organization_id: null,
    workspace_id: null,
    workspace_type: null,
    linked_drive_id: null,
    drive_type: null,
    metadata: { provider },
  });
}
