/**
 * Single contract for storage-increasing operations (server).
 * API routes should use this module rather than reimplementing quota math.
 */

import { checkUserCanUpload, getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { createPendingReservationAtomic } from "@/lib/storage-quota-reservations";
import { commitReservation, releaseReservation } from "@/lib/storage-quota-reservations";

export { checkUserCanUpload as checkStorageIncreaseAllowed, getUploadBillingSnapshot };

export interface PresignReservationResult {
  reservation_id: string | null;
}

export async function reserveStorageIncrease(
  uid: string,
  sizeBytes: number,
  driveId: string | undefined,
  objectKey: string | null
): Promise<{ reservation_id: string | null }> {
  await checkUserCanUpload(uid, sizeBytes, driveId);
  const snap = await getUploadBillingSnapshot(uid, driveId);
  if (snap.quota_bytes === null) {
    return { reservation_id: null };
  }
  try {
    const reservation_id = await createPendingReservationAtomic({
      billing_key: snap.billing_key,
      file_used_bytes: snap.file_used_bytes,
      new_bytes: sizeBytes,
      quota_bytes: snap.quota_bytes,
      requesting_user_id: uid,
      drive_id: driveId ?? null,
      object_key: objectKey,
    });
    return { reservation_id };
  } catch (e) {
    if (e instanceof Error && e.message === "RESERVATION_QUOTA_RACE") {
      const err = new Error(
        "Storage quota changed while starting upload. Please try again in a moment."
      );
      (err as Error & { code?: string }).code = "storage_reservation_race";
      throw err;
    }
    throw e;
  }
}

export const commitStorageReservation = commitReservation;

export const releaseStorageReservation = releaseReservation;
