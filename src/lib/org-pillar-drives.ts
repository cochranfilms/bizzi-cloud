/**
 * Enterprise pillar drives: member "main" Storage / RAW / Gallery drives pair with org_shared drives.
 * Used to show one unified file list per pillar (member private + org shared).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";

export async function resolveEnterprisePillarDriveIds(
  organizationId: string,
  memberDriveId: string
): Promise<string[]> {
  const db = getAdminFirestore();
  const driveSnap = await db.collection("linked_drives").doc(memberDriveId).get();
  if (!driveSnap.exists) return [memberDriveId];

  const driveData = driveSnap.data();
  if (driveData?.organization_id !== organizationId || driveData?.deleted_at) {
    return [memberDriveId];
  }

  const currentDriveType: "storage" | "raw" | "gallery" =
    driveData?.is_creator_raw === true
      ? "raw"
      : (driveData?.name ?? "").toLowerCase().includes("gallery")
        ? "gallery"
        : "storage";

  const sharedDrivesSnap = await db
    .collection("linked_drives")
    .where("organization_id", "==", organizationId)
    .where("is_org_shared", "==", true)
    .get();

  const sharedByName: Record<string, string> = {};
  for (const d of sharedDrivesSnap.docs) {
    const name = (d.data().name ?? "").toLowerCase();
    if (name.includes("storage")) sharedByName.storage = d.id;
    else if (name.includes("raw")) sharedByName.raw = d.id;
    else if (name.includes("gallery")) sharedByName.gallery = d.id;
  }

  const orgSharedId = sharedByName[currentDriveType] ?? null;
  const ids = [memberDriveId];
  if (orgSharedId && orgSharedId !== memberDriveId) ids.push(orgSharedId);
  return ids;
}
