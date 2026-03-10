/**
 * Server-side helper to ensure Storage, RAW, and Gallery Media drives exist for a user.
 * Call from webhook and sync endpoints when a user subscribes (paid plan).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";

export async function ensureDefaultDrivesForUser(uid: string): Promise<void> {
  const db = getAdminFirestore();
  const drivesRef = db.collection("linked_drives");
  const snapshot = await drivesRef.where("userId", "==", uid).get();

  const existing = snapshot.docs
    .filter((d) => !d.data().deleted_at)
    .map((d) => {
      const data = d.data();
      return {
        name: data.name as string,
        isCreatorRaw: data.is_creator_raw === true,
      };
    });

  const hasStorage = existing.some(
    (e) => e.name === "Storage" || e.name === "Uploads"
  );
  const hasRaw = existing.some((e) => e.isCreatorRaw);
  const hasGalleryMedia = existing.some((e) => e.name === "Gallery Media");

  const batch = db.batch();
  const now = new Date();

  if (!hasStorage) {
    const storageRef = drivesRef.doc();
    batch.set(storageRef, {
      userId: uid,
      name: "Storage",
      permission_handle_id: `storage-${Date.now()}`,
      createdAt: now,
      organization_id: null,
    });
  }

  if (!hasRaw) {
    const rawRef = drivesRef.doc();
    batch.set(rawRef, {
      userId: uid,
      name: "RAW",
      permission_handle_id: `creator-raw-${Date.now()}`,
      createdAt: now,
      creator_section: true,
      is_creator_raw: true,
      organization_id: null,
    });
  }

  if (!hasGalleryMedia) {
    const galleryRef = drivesRef.doc();
    batch.set(galleryRef, {
      userId: uid,
      name: "Gallery Media",
      permission_handle_id: `gallery-media-${Date.now()}`,
      createdAt: now,
      organization_id: null,
    });
  }

  if (!hasStorage || !hasRaw || !hasGalleryMedia) {
    await batch.commit();
  }
}
