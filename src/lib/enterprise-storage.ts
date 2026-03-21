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
import { assertStorageLifecycleAllowsAccess } from "./storage-lifecycle";

export {
  ENTERPRISE_ORG_STORAGE_BYTES,
  ENTERPRISE_OWNER_STORAGE_BYTES,
  SEAT_STORAGE_TIERS,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "./enterprise-constants";
export type { SeatStorageTier } from "./enterprise-constants";

/**
 * Check if a user can upload additional bytes.
 * When driveId is provided: uses the drive's organization_id to determine quota
 *   (enterprise drive → org quota; personal drive → personal quota).
 * When driveId is omitted: falls back to profile's organization_id (legacy behavior).
 * @throws Error with user-facing message if over quota
 */
export async function checkUserCanUpload(
  uid: string,
  additionalBytes: number,
  driveId?: string
): Promise<void> {
  await assertStorageLifecycleAllowsAccess(uid);
  const db = getAdminFirestore();

  let orgId: string | null;
  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    const driveData = driveSnap.data();
    const oid = driveData?.organization_id;
    orgId = typeof oid === "string" ? oid : null;
  } else {
    const profileSnap = await db.collection("profiles").doc(uid).get();
    orgId = (profileSnap.data()?.organization_id as string) ?? null;
  }

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();

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
      if (data.deleted_at) continue;
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

    let filesQuery = db.collection("backup_files").where("userId", "==", uid);
    filesQuery = filesQuery.where("organization_id", "==", null) as ReturnType<
      typeof db.collection
    >;
    const filesSnap = await filesQuery.get();
    usedBytes = 0;
    for (const docSnap of filesSnap.docs) {
      const data = docSnap.data();
      if (data.deleted_at) continue;
      usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
    }
  }

  if (quotaBytes !== null && usedBytes + additionalBytes > quotaBytes) {
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    const quotaGB = (quotaBytes / (1024 ** 3)).toFixed(1);
    const msg = orgId
      ? `Storage limit reached. You're using ${usedGB} GB of ${quotaGB} GB. Contact your organization owner to upgrade your storage allocation.`
      : `Storage limit reached. You're using ${usedGB} GB of ${quotaGB} GB. Upgrade your storage plan to add more space.`;
    throw new Error(msg);
  }
}

export interface StorageStatus {
  storage_used_bytes: number;
  storage_quota_bytes: number | null;
  is_organization_user: boolean;
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
      if (data.deleted_at) continue;
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

    let filesQuery = db.collection("backup_files").where("userId", "==", uid);
    filesQuery = filesQuery.where("organization_id", "==", null) as typeof filesQuery;
    const filesSnap = await filesQuery.get();
    usedBytes = 0;
    for (const docSnap of filesSnap.docs) {
      const data = docSnap.data();
      if (data.deleted_at) continue;
      usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
    }
  }

  return {
    storage_used_bytes: usedBytes,
    storage_quota_bytes: quotaBytes,
    is_organization_user: !!orgId,
  };
}
