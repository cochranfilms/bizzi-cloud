import {
  reserveStorageIncrease,
  type PresignReservationResult,
} from "@/lib/storage-quota-service";

export type { PresignReservationResult };

/**
 * Run quota check (incl. pending reservations), then atomically hold bytes for this upload.
 * Skips Firestore reservation when quota is unlimited (null).
 */
export async function checkAndReserveUploadBytes(
  uid: string,
  sizeBytes: number,
  driveId: string | undefined,
  objectKey: string | null
): Promise<PresignReservationResult> {
  return reserveStorageIncrease(uid, sizeBytes, driveId, objectKey);
}
