/**
 * Server-side helper to ensure Storage, RAW, and Gallery Media drives exist for a user.
 * Call from webhook and sync endpoints when a user subscribes (paid plan).
 * Only creates RAW if user has editor/fullframe addon; only creates Gallery Media if user has gallery/fullframe addon.
 *
 * Idempotent: queries existing drives first; only creates missing ones.
 * Safe if Stripe webhook fires twice—second run sees drives and skips creation.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";

function hasEditorAddon(addonIds: string[]): boolean {
  return addonIds.includes("editor") || addonIds.includes("fullframe");
}

function hasGalleryAddon(addonIds: string[]): boolean {
  return addonIds.includes("gallery") || addonIds.includes("fullframe");
}

export async function ensureDefaultDrivesForUser(uid: string): Promise<void> {
  const db = getAdminFirestore();

  // Fetch profile to check addon_ids (caller has just updated profile before this runs)
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const addonIds: string[] = profileSnap.exists
    ? (profileSnap.data()?.addon_ids ?? [])
    : [];

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
  let writeCount = 0;

  if (!hasStorage) {
    const storageRef = drivesRef.doc();
    batch.set(storageRef, {
      userId: uid,
      name: "Storage",
      permission_handle_id: `storage-${Date.now()}`,
      createdAt: now,
      organization_id: null,
    });
    writeCount++;
  }

  // RAW folder only for users with Editor or Full Frame power-up
  if (!hasRaw && hasEditorAddon(addonIds)) {
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
    writeCount++;
  }

  // Gallery Media folder only for users with Gallery Suite or Full Frame power-up
  if (!hasGalleryMedia && hasGalleryAddon(addonIds)) {
    const galleryRef = drivesRef.doc();
    batch.set(galleryRef, {
      userId: uid,
      name: "Gallery Media",
      permission_handle_id: `gallery-media-${Date.now()}`,
      createdAt: now,
      organization_id: null,
    });
    writeCount++;
  }

  if (writeCount > 0) {
    await batch.commit();
  }
}

/**
 * Ensure default drives (Storage, RAW, Gallery Media) for an enterprise org member.
 * Call when a user accepts an invite to join an organization.
 * Creates org-scoped drives (organization_id = orgId) based on org addon_ids.
 */
export async function ensureDefaultDrivesForOrgUser(
  uid: string,
  orgId: string,
  addonIds: string[]
): Promise<void> {
  const db = getAdminFirestore();
  const drivesRef = db.collection("linked_drives");

  const snapshot = await drivesRef
    .where("userId", "==", uid)
    .where("organization_id", "==", orgId)
    .get();

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
  let writeCount = 0;

  if (!hasStorage) {
    const storageRef = drivesRef.doc();
    batch.set(storageRef, {
      userId: uid,
      name: "Storage",
      permission_handle_id: `storage-${Date.now()}`,
      createdAt: now,
      organization_id: orgId,
    });
    writeCount++;
  }

  if (!hasRaw && hasEditorAddon(addonIds)) {
    const rawRef = drivesRef.doc();
    batch.set(rawRef, {
      userId: uid,
      name: "RAW",
      permission_handle_id: `creator-raw-${Date.now()}`,
      createdAt: now,
      creator_section: true,
      is_creator_raw: true,
      organization_id: orgId,
    });
    writeCount++;
  }

  if (!hasGalleryMedia && hasGalleryAddon(addonIds)) {
    const galleryRef = drivesRef.doc();
    batch.set(galleryRef, {
      userId: uid,
      name: "Gallery Media",
      permission_handle_id: `gallery-media-${Date.now()}`,
      createdAt: now,
      organization_id: orgId,
    });
    writeCount++;
  }

  if (writeCount > 0) {
    await batch.commit();
  }
}
