/**
 * Storage lifecycle status and transitions.
 * billing_status = payment truth; storage_lifecycle_status = storage/access truth.
 *
 * V1 flow: active → grace_period → cold_storage → active or deleted
 * scheduled_delete = account deletion requested (narrow scope)
 *
 * Personal workspace: personal_status scopes deletion to personal only when org seats exist.
 */
import type { PersonalStatus } from "@/types/profile";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/audit-log";
import { FieldValue } from "firebase-admin/firestore";
import type { DocumentReference } from "firebase-admin/firestore";
import { GRACE_PERIOD_DAYS } from "@/lib/cold-storage-retention";
import { getStorageBytesForPlan } from "@/lib/plan-constants";
import { emptyTeamSeatCounts } from "@/lib/team-seat-pricing";

export type StorageLifecycleStatus =
  | "active"
  | "grace_period"
  | "cold_storage"
  | "scheduled_delete"
  | "deleted";

export interface StorageLifecycleInfo {
  status: StorageLifecycleStatus;
  gracePeriodEndsAt: Date | null;
  accountDeletionEffectiveAt: Date | null;
  isProfile: boolean;
  orgId: string | null;
  /** Personal workspace lifecycle; only relevant when isProfile/orgId null */
  personalStatus?: PersonalStatus;
  personalRestoreAvailableUntil?: Date | null;
}

/** True when read/write access should be denied (files in cold or scheduled for deletion) */
export function storageLifecycleBlocksAccess(status: StorageLifecycleStatus): boolean {
  return status === "cold_storage" || status === "scheduled_delete";
}

/** True when personal workspace is deleted/purged and blocks personal access */
export function personalStatusBlocksAccess(status: PersonalStatus | undefined): boolean {
  if (!status || status === "active") return false;
  return status === "scheduled_delete" || status === "purged";
}

/**
 * Get the effective storage lifecycle for a user (profile or current org).
 * Uses profile.organization_id to determine org context.
 */
export async function getEffectiveStorageLifecycle(uid: string): Promise<StorageLifecycleInfo> {
  const profileSnap = await getAdminFirestore().collection("profiles").doc(uid).get();
  const orgId = (profileSnap.data()?.organization_id as string) ?? null;
  return getStorageLifecycleStatus({ userId: uid, orgId });
}

/**
 * Throws if the user's effective storage lifecycle blocks access.
 * Use before read/write operations.
 * When in enterprise context (orgId from profile), personal lifecycle does not block.
 */
export async function assertStorageLifecycleAllowsAccess(uid: string): Promise<void> {
  const info = await getEffectiveStorageLifecycle(uid);
  if (storageLifecycleBlocksAccess(info.status)) {
    const msg =
      info.status === "scheduled_delete"
        ? "Your account is scheduled for deletion. Files remain recoverable until the deletion date."
        : "Your account is past due. Your files are protected in recovery storage. Pay your invoice to restore full access.";
    throw new Error(msg);
  }
  if (info.isProfile && personalStatusBlocksAccess(info.personalStatus)) {
    throw new Error(
      "Your personal account has been deleted. You can restore it within the grace period or continue to your enterprise workspace."
    );
  }
}

/**
 * Get storage lifecycle status for a user (consumer) or org.
 * For consumer: reads profile. For org member: may need org context.
 */
export async function getStorageLifecycleStatus(params: {
  userId: string;
  orgId?: string | null;
}): Promise<StorageLifecycleInfo> {
  const db = getAdminFirestore();
  const { userId, orgId } = params;

  if (orgId) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    const status = (orgData?.storage_lifecycle_status as StorageLifecycleStatus) ?? "active";
    const graceEnd = orgData?.grace_period_ends_at?.toDate?.() ?? null;
    return {
      status,
      gracePeriodEndsAt: graceEnd,
      accountDeletionEffectiveAt: null,
      isProfile: false,
      orgId,
    };
  }

  const profileSnap = await db.collection("profiles").doc(userId).get();
  const profileData = profileSnap.data();
  const status = (profileData?.storage_lifecycle_status as StorageLifecycleStatus) ?? "active";
  const graceEnd = profileData?.grace_period_ends_at?.toDate?.() ?? null;
  const deletionAt = profileData?.account_deletion_effective_at?.toDate?.() ?? null;
  const personalStatus = (profileData?.personal_status as PersonalStatus | undefined) ?? "active";
  const personalRestoreUntil = profileData?.personal_restore_available_until?.toDate?.() ?? null;

  return {
    status,
    gracePeriodEndsAt: graceEnd,
    accountDeletionEffectiveAt: deletionAt,
    isProfile: true,
    orgId: null,
    personalStatus,
    personalRestoreAvailableUntil: personalRestoreUntil,
  };
}

/**
 * Transition to grace period (first payment failure).
 * Files stay in backup_files; free tier write limit applies.
 */
export async function transitionToGracePeriod(params: {
  target: "profile" | "org";
  id: string;
  unpaidInvoiceUrl?: string | null;
}): Promise<void> {
  const db = getAdminFirestore();
  const now = new Date();
  const graceEndsAt = new Date(now);
  graceEndsAt.setDate(graceEndsAt.getDate() + GRACE_PERIOD_DAYS);

  const update: Record<string, unknown> = {
    storage_lifecycle_status: "grace_period",
    grace_period_ends_at: graceEndsAt,
    billing_status: "past_due",
    storage_quota_bytes: getStorageBytesForPlan("free"),
    stripe_updated_at: now.toISOString(),
  };
  if (params.unpaidInvoiceUrl != null) {
    update.unpaid_invoice_url = params.unpaidInvoiceUrl;
  }

  if (params.target === "profile") {
    await db.collection("profiles").doc(params.id).set(update, { merge: true });
    await writeAuditLog({
      action: "grace_period_started",
      uid: params.id,
      metadata: { grace_period_ends_at: graceEndsAt.toISOString() },
    });
  } else {
    await db.collection("organizations").doc(params.id).update(update);
    await writeAuditLog({
      action: "grace_period_started",
      metadata: { org_id: params.id, grace_period_ends_at: graceEndsAt.toISOString() },
    });
  }
}

/**
 * Transition to cold storage (grace expired or subscription canceled).
 * Caller is responsible for calling migrateConsumerToColdStorage or migrateOrgToColdStorage.
 * This only updates the profile/org lifecycle status.
 */
export async function transitionToColdStorage(params: {
  target: "profile" | "org";
  id: string;
  /** "past_due" when grace expired; "canceled" when subscription deleted */
  billingStatus?: "past_due" | "canceled";
  auditTrigger?: string;
}): Promise<void> {
  const db = getAdminFirestore();
  const billingStatus = params.billingStatus ?? "past_due";
  const trigger = params.auditTrigger ?? "grace_period_expired_or_subscription_deleted";

  const update: Record<string, unknown> = {
    storage_lifecycle_status: "cold_storage" as const,
    grace_period_ends_at: FieldValue.delete(),
    billing_status: billingStatus,
    storage_quota_bytes: getStorageBytesForPlan("free"),
    stripe_updated_at: new Date().toISOString(),
  };
  if (billingStatus === "canceled") {
    update.unpaid_invoice_url = FieldValue.delete();
    update.stripe_subscription_id = null;
  }

  if (params.target === "profile") {
    await db.collection("profiles").doc(params.id).set(update, { merge: true });
    await writeAuditLog({
      action: "cold_storage_entered",
      uid: params.id,
      metadata: { trigger },
    });
  } else {
    await db.collection("organizations").doc(params.id).update(update);
    await writeAuditLog({
      action: "cold_storage_entered",
      metadata: { org_id: params.id, trigger },
    });
  }
}

/**
 * Transition to scheduled delete (account deletion requested).
 * Narrow scope: only for account deletion flow.
 */
export async function transitionToScheduledDelete(params: {
  userId: string;
  requestedAt: Date;
  effectiveAt: Date;
}): Promise<void> {
  const db = getAdminFirestore();
  const { userId, requestedAt, effectiveAt } = params;

  const { Timestamp } = await import("firebase-admin/firestore");

  await db.collection("profiles").doc(userId).set(
    {
      storage_lifecycle_status: "scheduled_delete" as const,
      account_deletion_requested_at: Timestamp.fromDate(requestedAt),
      account_deletion_effective_at: Timestamp.fromDate(effectiveAt),
      plan_id: "free",
      addon_ids: [],
      seat_count: 1,
      team_seat_counts: emptyTeamSeatCounts(),
      storage_addon_id: null,
      storage_quota_bytes: getStorageBytesForPlan("free"),
      stripe_subscription_id: null,
      billing_status: "canceled",
      unpaid_invoice_url: null,
      grace_period_ends_at: FieldValue.delete(),
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: "scheduled_deletion_created",
    uid: userId,
    metadata: { effective_at: effectiveAt.toISOString() },
  });
}

/**
 * Transition to personal workspace scheduled delete (personal-only deletion).
 * Preserves organization_id and organization_role.
 * Use when user has active org seats.
 */
export async function transitionToPersonalScheduledDelete(params: {
  userId: string;
  requestedAt: Date;
  effectiveAt: Date;
}): Promise<void> {
  const db = getAdminFirestore();
  const { userId, requestedAt, effectiveAt } = params;

  const { Timestamp } = await import("firebase-admin/firestore");

  await db.collection("profiles").doc(userId).set(
    {
      personal_status: "scheduled_delete" as const,
      personal_deleted_at: Timestamp.fromDate(requestedAt),
      personal_restore_available_until: Timestamp.fromDate(effectiveAt),
      storage_lifecycle_status: "scheduled_delete" as const,
      account_deletion_requested_at: Timestamp.fromDate(requestedAt),
      account_deletion_effective_at: Timestamp.fromDate(effectiveAt),
      plan_id: "free",
      addon_ids: [],
      seat_count: 1,
      team_seat_counts: emptyTeamSeatCounts(),
      storage_addon_id: null,
      storage_quota_bytes: getStorageBytesForPlan("free"),
      stripe_subscription_id: null,
      billing_status: "canceled",
      unpaid_invoice_url: null,
      grace_period_ends_at: FieldValue.delete(),
      stripe_updated_at: new Date().toISOString(),
    },
    { merge: true }
  );

  await writeAuditLog({
    action: "personal_scheduled_deletion_created",
    uid: userId,
    metadata: { effective_at: effectiveAt.toISOString() },
  });
}

/**
 * Restore personal workspace to active (restore completed).
 * Clears personal_status and deletion timestamps.
 */
export async function restorePersonalToActive(params: { userId: string }): Promise<void> {
  const db = getAdminFirestore();

  await db.collection("profiles").doc(params.userId).update({
    personal_status: "active",
    personal_deleted_at: FieldValue.delete(),
    personal_restore_available_until: FieldValue.delete(),
    personal_purge_at: FieldValue.delete(),
    storage_lifecycle_status: "active",
    account_deletion_requested_at: FieldValue.delete(),
    account_deletion_effective_at: FieldValue.delete(),
  });
}

/**
 * Restore to active (payment succeeded or restore completed).
 */
export async function restoreToActive(params: {
  target: "profile" | "org";
  id: string;
}): Promise<void> {
  const db = getAdminFirestore();

  const update = {
    storage_lifecycle_status: "active" as const,
    grace_period_ends_at: FieldValue.delete(),
    billing_status: "active",
    unpaid_invoice_url: FieldValue.delete(),
    account_deletion_requested_at: FieldValue.delete(),
    account_deletion_effective_at: FieldValue.delete(),
  };

  if (params.target === "profile") {
    await db.collection("profiles").doc(params.id).update(update);
  } else {
    await db.collection("organizations").doc(params.id).update(update);
  }
}

/**
 * Mark as deleted (permanent deletion completed).
 * Used by account-deletion-cleanup after profile/auth deletion.
 */
export async function markDeleted(params: { userId: string }): Promise<void> {
  await writeAuditLog({
    action: "storage_lifecycle_deleted",
    uid: params.userId,
    metadata: {},
  });
}
