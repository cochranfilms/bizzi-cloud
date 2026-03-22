/**
 * Ensures system workspaces exist for org drives.
 * Call after ensureDefaultDrivesForOrgUser.
 * Creates "My Private" workspace per drive (private_org visibility).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";

function getDriveType(driveData: { name?: string; is_creator_raw?: boolean }): "storage" | "raw" | "gallery" | null {
  if (driveData.is_creator_raw === true) return "raw";
  const name = (driveData.name ?? "").toLowerCase();
  if (name === "storage" || name === "uploads") return "storage";
  if (name === "gallery media") return "gallery";
  return null;
}

/**
 * Ensure "My Private" system workspace exists for each org drive owned by the user.
 * Idempotent: skips drives that already have a private workspace.
 */
export async function ensureDefaultWorkspacesForOrgUser(
  uid: string,
  orgId: string
): Promise<void> {
  const db = getAdminFirestore();
  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", uid)
    .where("organization_id", "==", orgId)
    .get();

  const now = new Date().toISOString();
  const workspacesRef = db.collection("workspaces");
  let created = 0;

  for (const driveDoc of drivesSnap.docs) {
    const driveData = driveDoc.data();
    if (driveData.deleted_at) continue;

    const driveId = driveDoc.id;
    const driveType = getDriveType(driveData);

    const existingSnap = await workspacesRef
      .where("organization_id", "==", orgId)
      .where("drive_id", "==", driveId)
      .where("workspace_type", "==", "private")
      .limit(1)
      .get();

    if (!existingSnap.empty) continue;

    const workspaceName =
      driveType === "raw" ? "My Private RAW" : driveType === "gallery" ? "Gallery Drafts" : "My Private";

    await workspacesRef.add({
      organization_id: orgId,
      drive_id: driveId,
      drive_type: driveType,
      name: workspaceName,
      workspace_type: "private",
      created_by: uid,
      member_user_ids: [uid],
      team_id: null,
      project_id: null,
      gallery_id: null,
      is_system_workspace: true,
      created_at: now,
      updated_at: now,
    });
    created++;
  }

  if (created > 0) {
    console.log(`[ensureDefaultWorkspacesForOrgUser] Created ${created} workspaces for org ${orgId}`);
  }
}

/**
 * Get or create "My Private" workspace ID for a drive in org context.
 * Returns null for personal drives.
 */
export async function getOrCreateMyPrivateWorkspaceId(
  uid: string,
  orgId: string,
  driveId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  if (!driveSnap.exists) return null;

  const driveData = driveSnap.data();
  if (driveData?.organization_id !== orgId) return null;
  if (driveData?.deleted_at) return null;

  const existingSnap = await db
    .collection("workspaces")
    .where("organization_id", "==", orgId)
    .where("drive_id", "==", driveId)
    .where("workspace_type", "==", "private")
    .where("created_by", "==", uid)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    return existingSnap.docs[0].id;
  }

  // Create workspace
  const driveType = getDriveType(driveData);
  const workspaceName =
    driveType === "raw" ? "My Private RAW" : driveType === "gallery" ? "Gallery Drafts" : "My Private";
  const now = new Date().toISOString();

  const ref = await db.collection("workspaces").add({
    organization_id: orgId,
    drive_id: driveId,
    drive_type: driveType,
    name: workspaceName,
    workspace_type: "private",
    created_by: uid,
    member_user_ids: [uid],
    team_id: null,
    project_id: null,
    gallery_id: null,
    is_system_workspace: true,
    created_at: now,
    updated_at: now,
  });

  return ref.id;
}
