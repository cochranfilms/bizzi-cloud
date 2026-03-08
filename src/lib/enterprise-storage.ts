/**
 * Enterprise storage allocation utilities (server-only).
 * Constants are in enterprise-constants.ts for client-safe imports.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  ENTERPRISE_OWNER_STORAGE_BYTES,
  DEFAULT_SEAT_STORAGE_BYTES,
} from "./enterprise-constants";

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
    const seatId = `${orgId}_${uid}`;
    const seatSnap = await db.collection("organization_seats").doc(seatId).get();
    const seatData = seatSnap.data();
    const isOwner = seatData?.role === "admin";
    const seatQuota = seatData?.storage_quota_bytes;
    quotaBytes = isOwner
      ? ENTERPRISE_OWNER_STORAGE_BYTES
      : typeof seatQuota === "number"
        ? seatQuota
        : seatQuota === null
          ? null
          : DEFAULT_SEAT_STORAGE_BYTES;
  } else {
    const profileQuota = profileData?.storage_quota_bytes;
    quotaBytes =
      typeof profileQuota === "number"
        ? profileQuota
        : 50 * 1024 * 1024 * 1024;
  }

  let filesQuery = db.collection("backup_files").where("userId", "==", uid);
  if (orgId !== null) {
    filesQuery = filesQuery.where("organization_id", "==", orgId) as ReturnType<
      typeof db.collection
    >;
  } else {
    filesQuery = filesQuery.where("organization_id", "==", null) as ReturnType<
      typeof db.collection
    >;
  }
  const filesSnap = await filesQuery.get();

  usedBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (data.deleted_at) continue;
    usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
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
    const seatId = `${orgId}_${uid}`;
    const seatSnap = await db.collection("organization_seats").doc(seatId).get();
    const seatData = seatSnap.data();
    const isOwner = seatData?.role === "admin";
    const seatQuota = seatData?.storage_quota_bytes;
    quotaBytes = isOwner
      ? ENTERPRISE_OWNER_STORAGE_BYTES
      : typeof seatQuota === "number"
        ? seatQuota
        : seatQuota === null
          ? null
          : DEFAULT_SEAT_STORAGE_BYTES;
  } else {
    const profileQuota = profileData?.storage_quota_bytes;
    quotaBytes =
      typeof profileQuota === "number"
        ? profileQuota
        : 50 * 1024 * 1024 * 1024;
  }

  let filesQuery = db.collection("backup_files").where("userId", "==", uid);
  if (orgId) {
    filesQuery = filesQuery.where("organization_id", "==", orgId) as typeof filesQuery;
  } else {
    filesQuery = filesQuery.where("organization_id", "==", null) as typeof filesQuery;
  }
  const filesSnap = await filesQuery.get();

  usedBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (data.deleted_at) continue;
    usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }

  return {
    storage_used_bytes: usedBytes,
    storage_quota_bytes: quotaBytes,
    is_organization_user: !!orgId,
  };
}
