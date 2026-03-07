/**
 * Enterprise storage allocation constants and utilities.
 * Org gets 16TB total to distribute across seats.
 */

import { getAdminFirestore } from "@/lib/firebase-admin";

/** 16TB total for enterprise orgs to distribute */
export const ENTERPRISE_ORG_STORAGE_BYTES = 16 * 1024 * 1024 * 1024 * 1024;

/** Per-seat storage tier options (bytes). null = Unlimited */
export const SEAT_STORAGE_TIERS = {
  "100GB": 100 * 1024 * 1024 * 1024,
  "500GB": 500 * 1024 * 1024 * 1024,
  "1TB": 1024 * 1024 * 1024 * 1024,
  "2TB": 2 * 1024 * 1024 * 1024 * 1024,
  unlimited: null as number | null,
} as const;

export type SeatStorageTier = keyof typeof SEAT_STORAGE_TIERS;

/** Default allocation for new seats */
export const DEFAULT_SEAT_STORAGE_BYTES = SEAT_STORAGE_TIERS["1TB"];

/**
 * Check if a user can upload additional bytes.
 * For enterprise users: uses seat's storage_quota_bytes (null = unlimited).
 * For personal users: uses profile's storage_quota_bytes.
 * @throws Error with user-facing message if over quota
 */
export async function checkUserCanUpload(
  uid: string,
  additionalBytes: number
): Promise<void> {
  const db = getAdminFirestore();

  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const orgId = profileData?.organization_id as string | undefined;

  let quotaBytes: number | null;
  let usedBytes: number;

  if (orgId) {
    const seatId = `${orgId}_${uid}`;
    const seatSnap = await db.collection("organization_seats").doc(seatId).get();
    const seatData = seatSnap.data();
    const seatQuota = seatData?.storage_quota_bytes;
    quotaBytes =
      typeof seatQuota === "number"
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

  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .get();

  usedBytes = 0;
  for (const docSnap of filesSnap.docs) {
    const data = docSnap.data();
    if (data.deleted_at) continue;
    usedBytes += typeof data.size_bytes === "number" ? data.size_bytes : 0;
  }

  if (quotaBytes !== null && usedBytes + additionalBytes > quotaBytes) {
    const usedGB = (usedBytes / (1024 ** 3)).toFixed(1);
    const quotaGB = (quotaBytes / (1024 ** 3)).toFixed(1);
    throw new Error(
      `Storage limit reached. You're using ${usedGB} GB of ${quotaGB} GB. Contact your organization admin to increase your allocation.`
    );
  }
}
