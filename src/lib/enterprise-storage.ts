/**
 * Enterprise storage allocation utilities (server-only).
 * Constants are in enterprise-constants.ts for client-safe imports.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  ENTERPRISE_OWNER_STORAGE_BYTES,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "./enterprise-constants";
import { FREE_TIER_STORAGE_BYTES } from "./plan-constants";
import { PERSONAL_TEAM_SEATS_COLLECTION, personalTeamSeatDocId } from "./personal-team";
import { assertStorageLifecycleAllowsAccess } from "./storage-lifecycle";
import { isBackupFileActiveForListing } from "./backup-file-lifecycle";
import { sumActiveUserOrgBackupBytes } from "./backup-file-storage-bytes";
import {
  billingKeyForOrg,
  billingKeyForUser,
  sumPendingReservationBytes,
  sumPendingReservationBytesForRequestingUser,
} from "./storage-quota-reservations";
import { StorageQuotaDeniedError } from "./storage-quota-denied-error";
import { logEnterpriseSecurityEvent } from "./enterprise-security-log";
import { seatNumericCapForEnforcement } from "./org-seat-quota";

export {
  ENTERPRISE_ORG_STORAGE_BYTES,
  ENTERPRISE_OWNER_STORAGE_BYTES,
  SEAT_STORAGE_TIERS,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "./enterprise-constants";
export type { SeatStorageTier } from "./enterprise-constants";

export { StorageQuotaDeniedError } from "./storage-quota-denied-error";
export type { StorageQuotaDenialPayload, StorageUsageScopeForDenial } from "./storage-quota-denied-error";

/** Personal-account storage billed to subjectUid: own files + team uploads attributed to them. */
export async function sumPersonalBackupBytesForQuota(subjectUid: string): Promise<number> {
  const db = getAdminFirestore();
  const [asOwner, asTeamHost] = await Promise.all([
    db
      .collection("backup_files")
      .where("userId", "==", subjectUid)
      .where("organization_id", "==", null)
      .get(),
    db
      .collection("backup_files")
      .where("personal_team_owner_id", "==", subjectUid)
      .where("organization_id", "==", null)
      .get(),
  ]);
  const seen = new Set<string>();
  let used = 0;
  for (const snap of [asOwner, asTeamHost]) {
    for (const docSnap of snap.docs) {
      if (seen.has(docSnap.id)) continue;
      const data = docSnap.data();
      if (!isBackupFileActiveForListing(data as Record<string, unknown>)) continue;
      seen.add(docSnap.id);
      used += typeof data.size_bytes === "number" ? data.size_bytes : 0;
    }
  }
  return used;
}

/** Active backup bytes billed to the personal-team container (explicit PTO on the file). */
export async function sumTeamContainerBackupBytes(teamOwnerUid: string): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("backup_files")
    .where("personal_team_owner_id", "==", teamOwnerUid)
    .where("organization_id", "==", null)
    .get();
  let used = 0;
  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (!isBackupFileActiveForListing(data as Record<string, unknown>)) continue;
    used += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }
  return used;
}

/** Bytes that count toward this user's own subscription (excludes team-folder uploads). */
export async function sumSoloPersonalBackupBytes(uid: string): Promise<number> {
  const db = getAdminFirestore();
  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("organization_id", "==", null)
    .get();
  let used = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (!isBackupFileActiveForListing(data as Record<string, unknown>)) continue;
    if (typeof data.personal_team_owner_id === "string" && data.personal_team_owner_id)
      continue;
    used += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }
  return used;
}

export interface UploadBillingSnapshot {
  requesting_user_id: string;
  quota_subject_uid: string;
  organization_id: string | null;
  billing_key: string;
  file_used_bytes: number;
  quota_bytes: number | null;
}

/**
 * Resolve who is billed and current file-backed usage (no pending reservations).
 * @throws Error for seat/access failures (same as checkUserCanUpload).
 */
export async function getUploadBillingSnapshot(
  uid: string,
  driveId?: string
): Promise<UploadBillingSnapshot> {
  const db = getAdminFirestore();

  let orgId: string | null;
  let quotaSubjectUid = uid;
  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    const driveData = driveSnap.data();
    const oid = driveData?.organization_id;
    orgId = typeof oid === "string" ? oid : null;
    const driveOwner =
      typeof driveData?.userId === "string"
        ? (driveData.userId as string)
        : typeof driveData?.user_id === "string"
          ? (driveData.user_id as string)
          : null;
    if (!orgId && driveOwner && driveOwner !== uid) {
      const seatRef = db
        .collection(PERSONAL_TEAM_SEATS_COLLECTION)
        .doc(personalTeamSeatDocId(driveOwner, uid));
      const seatSnap = await seatRef.get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || st !== "active") {
        throw new Error("You do not have access to upload to this drive.");
      }
      quotaSubjectUid = driveOwner;
    }
  } else {
    const profileSnap = await db.collection("profiles").doc(uid).get();
    orgId = (profileSnap.data()?.organization_id as string) ?? null;
  }

  const profileSnap = await db.collection("profiles").doc(quotaSubjectUid).get();
  const profileData = profileSnap.data();

  let quotaBytes: number | null;
  let usedBytes: number;

  if (orgId) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    const orgBillingPastDue = orgData?.billing_status === "past_due";
    quotaBytes = orgBillingPastDue
      ? FREE_TIER_STORAGE_BYTES
      : typeof orgData?.storage_quota_bytes === "number"
        ? orgData.storage_quota_bytes
        : null;

    const orgFilesSnap = await db
      .collection("backup_files")
      .where("organization_id", "==", orgId)
      .get();
    usedBytes = 0;
    for (const docSnap of orgFilesSnap.docs) {
      const data = docSnap.data();
      if (!isBackupFileActiveForListing(data as Record<string, unknown>)) continue;
      usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
    }
  } else {
    const profileBillingPastDue = profileData?.billing_status === "past_due";
    const profileQuota = profileData?.storage_quota_bytes;
    quotaBytes = profileBillingPastDue
      ? FREE_TIER_STORAGE_BYTES
      : typeof profileQuota === "number"
        ? profileQuota
        : FREE_TIER_STORAGE_BYTES;

    usedBytes = await sumPersonalBackupBytesForQuota(quotaSubjectUid);
  }

  const billing_key = orgId ? billingKeyForOrg(orgId) : billingKeyForUser(quotaSubjectUid);

  return {
    requesting_user_id: uid,
    quota_subject_uid: quotaSubjectUid,
    organization_id: orgId,
    billing_key,
    file_used_bytes: usedBytes,
    quota_bytes: quotaBytes,
  };
}

function buildQuotaDeniedMessage(
  orgId: string | null,
  quotaSubjectUid: string,
  requestingUid: string
): { msg: string; scope: "personal" | "personal_team_workspace" | "enterprise_workspace" } {
  if (orgId) {
    return {
      scope: "enterprise_workspace",
      msg:
        "This upload would exceed your organization’s shared storage pool. Free space or ask an admin to upgrade.",
    };
  }
  if (quotaSubjectUid !== requestingUid) {
    return {
      scope: "personal_team_workspace",
      msg:
        "This team workspace uses storage from the team owner's plan. The owner's plan is full, so this upload cannot continue. They need to upgrade storage or free up space.",
    };
  }
  return {
    scope: "personal",
    msg: "Your plan is full. Upgrade storage or delete files to continue uploading.",
  };
}

/**
 * Check if a user can upload additional bytes.
 * When driveId is provided: uses the drive's organization_id to determine quota
 *   (enterprise drive → org quota; personal drive → personal quota).
 * When driveId is omitted: falls back to profile's organization_id (legacy behavior).
 * @throws StorageQuotaDeniedError if over quota (includes structured storage_denial)
 * @throws Error for access / lifecycle failures
 */
export async function checkUserCanUpload(
  uid: string,
  additionalBytes: number,
  driveId?: string
): Promise<void> {
  await assertStorageLifecycleAllowsAccess(uid);
  const snap = await getUploadBillingSnapshot(uid, driveId);
  if (snap.quota_subject_uid !== uid) {
    await assertStorageLifecycleAllowsAccess(snap.quota_subject_uid);
  }

  const reserved = await sumPendingReservationBytes(snap.billing_key);
  const effective = snap.file_used_bytes + reserved;

  if (snap.quota_bytes !== null && effective + additionalBytes > snap.quota_bytes) {
    const { msg, scope } = buildQuotaDeniedMessage(
      snap.organization_id,
      snap.quota_subject_uid,
      uid
    );
    const remaining = Math.max(0, snap.quota_bytes - effective);
    logEnterpriseSecurityEvent("storage_quota_denied", {
      denial_reason: "organization_pool",
      requesting_user_id: uid,
      organization_id: snap.organization_id,
      additional_bytes: additionalBytes,
      effective_billable_bytes_for_enforcement: effective,
      quota_bytes: snap.quota_bytes,
    });
    throw new StorageQuotaDeniedError(msg, {
      requesting_user_id: uid,
      billing_subject_user_id: snap.organization_id ? null : snap.quota_subject_uid,
      organization_id: snap.organization_id,
      usage_scope: scope,
      file_used_bytes: snap.file_used_bytes,
      reserved_bytes: reserved,
      effective_billable_bytes_for_enforcement: effective,
      quota_bytes: snap.quota_bytes,
      additional_bytes: additionalBytes,
      denial_reason: "organization_pool",
      remaining_bytes: remaining,
    });
  }

  const orgIdForSeat = snap.organization_id;
  if (
    orgIdForSeat &&
    snap.quota_subject_uid === uid
  ) {
    const db = getAdminFirestore();
    const seatSnap = await db
      .collection("organization_seats")
      .doc(`${orgIdForSeat}_${uid}`)
      .get();
    const seatQuota = seatNumericCapForEnforcement(
      seatSnap.data() as Record<string, unknown> | undefined
    );
    if (typeof seatQuota === "number") {
      const seatUsed = await sumActiveUserOrgBackupBytes(db, uid, orgIdForSeat);
      const seatReserved = await sumPendingReservationBytesForRequestingUser(
        billingKeyForOrg(orgIdForSeat),
        uid
      );
      const seatEffective = seatUsed + seatReserved;
      if (seatEffective + additionalBytes > seatQuota) {
        const remaining = Math.max(0, seatQuota - seatEffective);
        logEnterpriseSecurityEvent("storage_quota_denied", {
          denial_reason: "seat_allocation",
          requesting_user_id: uid,
          organization_id: orgIdForSeat,
          additional_bytes: additionalBytes,
          effective_billable_bytes_for_enforcement: seatEffective,
          quota_bytes: seatQuota,
        });
        throw new StorageQuotaDeniedError(
          "This upload would exceed your seat allocation for this organization. Ask an admin to raise your cap or free space.",
          {
            requesting_user_id: uid,
            billing_subject_user_id: null,
            organization_id: orgIdForSeat,
            usage_scope: "enterprise_workspace",
            file_used_bytes: seatUsed,
            reserved_bytes: seatReserved,
            effective_billable_bytes_for_enforcement: seatEffective,
            quota_bytes: seatQuota,
            additional_bytes: additionalBytes,
            denial_reason: "seat_allocation",
            remaining_bytes: remaining,
          }
        );
      }
    }
  }
}

export interface StorageStatus {
  /** Solo personal bytes (no team PTO on file). Shown as "Your storage" on /dashboard. */
  storage_used_bytes: number;
  storage_quota_bytes: number | null;
  is_organization_user: boolean;
  /**
   * Non-org: combined solo + personal-team-container bytes for plan limit checks.
   * Clients should use this (when present) for pre-upload quota math, not storage_used_bytes.
   */
  storage_used_total_for_quota?: number;
}

/**
 * Get current storage status for a user (used for pre-upload checks).
 * @param context - When "enterprise", use org quota and count only enterprise files.
 *   When "personal" or omitted, use personal quota and count only personal files.
 */
export async function getStorageStatus(
  uid: string,
  context?: "personal" | "enterprise"
): Promise<StorageStatus> {
  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const profileOrgId = profileData?.organization_id as string | undefined;

  const useEnterprise = context === "enterprise" && profileOrgId;
  const orgId = useEnterprise ? profileOrgId : null;

  let quotaBytes: number | null;
  let usedBytes: number;

  if (orgId) {
    // Org storage is shared: quota and used are org-wide, not per-seat
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgData = orgSnap.data();
    const orgBillingPastDue = orgData?.billing_status === "past_due";
    quotaBytes = orgBillingPastDue
      ? FREE_TIER_STORAGE_BYTES
      : typeof orgData?.storage_quota_bytes === "number"
        ? orgData.storage_quota_bytes
        : null;

    const orgFilesSnap = await db
      .collection("backup_files")
      .where("organization_id", "==", orgId)
      .get();
    usedBytes = 0;
    for (const docSnap of orgFilesSnap.docs) {
      const data = docSnap.data();
      if (!isBackupFileActiveForListing(data as Record<string, unknown>)) continue;
      usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
    }
  } else {
    const profileBillingPastDue = profileData?.billing_status === "past_due";
    const profileQuota = profileData?.storage_quota_bytes;
    quotaBytes = profileBillingPastDue
      ? FREE_TIER_STORAGE_BYTES
      : typeof profileQuota === "number"
        ? profileQuota
        : FREE_TIER_STORAGE_BYTES;

    const soloUsed = await sumSoloPersonalBackupBytes(uid);
    const totalForQuota = await sumPersonalBackupBytesForQuota(uid);
    usedBytes = soloUsed;
    return {
      storage_used_bytes: usedBytes,
      storage_quota_bytes: quotaBytes,
      is_organization_user: !!orgId,
      storage_used_total_for_quota: totalForQuota,
    };
  }

  return {
    storage_used_bytes: usedBytes,
    storage_quota_bytes: quotaBytes,
    is_organization_user: !!orgId,
  };
}

/**
 * Storage bar for `/team/[ownerId]`: same plan quota as the owner profile; used bytes are
 * only files tagged with personal_team_owner_id (team-container scope), not solo personal.
 */
export async function getPersonalTeamWorkspaceStorageDisplay(teamOwnerUid: string): Promise<{
  storage_used_bytes: number;
  storage_quota_bytes: number;
}> {
  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(teamOwnerUid).get();
  const profileData = profileSnap.data();
  const profileBillingPastDue = profileData?.billing_status === "past_due";
  const profileQuota = profileData?.storage_quota_bytes;
  const storage_quota_bytes = profileBillingPastDue
    ? FREE_TIER_STORAGE_BYTES
    : typeof profileQuota === "number"
      ? profileQuota
      : FREE_TIER_STORAGE_BYTES;
  const storage_used_bytes = await sumTeamContainerBackupBytes(teamOwnerUid);
  return { storage_used_bytes, storage_quota_bytes };
}
