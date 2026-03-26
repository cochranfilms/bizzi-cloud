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

/**
 * Shared pillar (org_shared) drive + workspace for a member's pillar drive, when Shared Storage/RAW/Gallery exist.
 * Used so enterprise uploads land in the shared library visible to all seat members (team-like workflow).
 */
export async function getOrgSharedUploadTarget(
  organizationId: string,
  memberDriveId: string
): Promise<{ workspaceId: string; sharedDriveId: string } | null> {
  const db = getAdminFirestore();
  const pillarIds = await resolveEnterprisePillarDriveIds(organizationId, memberDriveId);
  for (const driveId of pillarIds) {
    if (driveId === memberDriveId) continue;
    const dSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!dSnap.exists || dSnap.data()?.deleted_at) continue;
    if (dSnap.data()?.is_org_shared !== true) continue;
    const wsSnap = await db
      .collection("workspaces")
      .where("organization_id", "==", organizationId)
      .where("drive_id", "==", driveId)
      .where("workspace_type", "==", "org_shared")
      .limit(1)
      .get();
    if (wsSnap.empty) continue;
    return { workspaceId: wsSnap.docs[0].id, sharedDriveId: driveId };
  }
  return null;
}
