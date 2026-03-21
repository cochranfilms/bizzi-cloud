/**
 * Personal workspace lifecycle status.
 * Omit personal_status = treat as "active" (backward compatibility).
 */
export type PersonalStatus =
  | "active"
  | "scheduled_delete"
  | "recoverable"
  | "purged";

/** Profile fields for personal workspace deletion flow. */
export interface PersonalWorkspaceLifecycle {
  personal_status?: PersonalStatus;
  /** Firestore Timestamp - when deletion was requested */
  personal_deleted_at?: unknown;
  /** Firestore Timestamp - grace window end */
  personal_restore_available_until?: unknown;
  /** Firestore Timestamp - when personal data was purged */
  personal_purge_at?: unknown;
}
