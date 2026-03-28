import { checkUserCanUpload, getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { createPendingReservationAtomic } from "@/lib/storage-quota-reservations";

export interface PresignReservationResult {
  reservation_id: string | null;
}

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
