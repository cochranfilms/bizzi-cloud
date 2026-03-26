/**
 * Workspace access helpers for organization file visibility.
 * Used by file listing APIs and canAccessBackupFileById.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Workspace, WorkspaceType } from "@/types/workspace";

/** Check if user is org admin */
export async function isOrgAdmin(uid: string, organizationId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const seatSnap = await db.collection("organization_seats").doc(`${organizationId}_${uid}`).get();
  return seatSnap.exists && (seatSnap.data()?.role === "admin");
}

/** Active organization membership (any role), for APIs when profile.organization_id may be stale. */
export async function userHasActiveOrganizationSeat(
  uid: string,
  organizationId: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const seatSnap = await db.collection("organization_seats").doc(`${organizationId}_${uid}`).get();
  return seatSnap.exists && seatSnap.data()?.status === "active";
}

/** Check if user can write to a workspace (upload, create, update, delete). */
export async function userCanWriteWorkspace(
  uid: string,
  workspaceId: string
): Promise<boolean> {
  return userCanAccessWorkspace(uid, workspaceId);
}

/** Check if user can access a workspace (read). */
export async function userCanAccessWorkspace(
  uid: string,
  workspaceId: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const wsSnap = await db.collection("workspaces").doc(workspaceId).get();
  if (!wsSnap.exists) return false;

  const ws = wsSnap.data() as Workspace | undefined;
  if (!ws) return false;

  const orgId = ws.organization_id;
  if (!orgId) return false;

  const admin = await isOrgAdmin(uid, orgId);
  if (admin) return true;

  const type: WorkspaceType = ws.workspace_type ?? "private";

  switch (type) {
    case "org_shared":
      // All org members can access - check org membership
      const seatSnap = await db.collection("organization_seats").doc(`${orgId}_${uid}`).get();
      if (seatSnap.exists && seatSnap.data()?.status === "active") return true;
      return false;

    case "private":
      // Owner (created_by) or member_user_ids
      if (ws.created_by === uid) return true;
      if (Array.isArray(ws.member_user_ids) && ws.member_user_ids.includes(uid)) return true;
      return false;

    case "team":
    case "project":
      // Explicit members + admin (already checked above)
      if (Array.isArray(ws.member_user_ids) && ws.member_user_ids.includes(uid)) return true;
      return false;

    case "gallery":
      // Gallery photographer or invited collaborator
      if (!ws.gallery_id) return false;
      const gallerySnap = await db.collection("galleries").doc(ws.gallery_id).get();
      if (!gallerySnap.exists) return false;
      const gallery = gallerySnap.data();
      if (gallery?.photographer_id === uid) return true;
      if (Array.isArray(gallery?.invited_emails)) {
        // Need user email - we check via profile or assume uid match for photographer
        // For invite_only, we'd need to resolve email. For now, photographer + admin.
        // Future: add gallery_collaborators collection or resolved userId from invited_emails
      }
      return false;

    default:
      return false;
  }
}

/**
 * Returns workspace IDs the user can access in the organization.
 * Used for file listing queries in enterprise context.
 * - Org admin: all org workspaces
 * - Otherwise: private (own), org_shared, team/project (member), gallery (photographer/collaborator)
 */
export async function getAccessibleWorkspaceIds(
  uid: string,
  organizationId: string
): Promise<string[]> {
  const db = getAdminFirestore();

  const admin = await isOrgAdmin(uid, organizationId);
  if (admin) {
    const snap = await db
      .collection("workspaces")
      .where("organization_id", "==", organizationId)
      .get();
    return snap.docs.map((d) => d.id);
  }

  const snap = await db
    .collection("workspaces")
    .where("organization_id", "==", organizationId)
    .get();

  const accessible: string[] = [];
  for (const doc of snap.docs) {
    const ws = doc.data() as Workspace;
    const type: WorkspaceType = ws.workspace_type ?? "private";

    switch (type) {
      case "org_shared":
        // All org members
        accessible.push(doc.id);
        break;
      case "private":
        if (ws.created_by === uid || (Array.isArray(ws.member_user_ids) && ws.member_user_ids.includes(uid))) {
          accessible.push(doc.id);
        }
        break;
      case "team":
      case "project":
        if (Array.isArray(ws.member_user_ids) && ws.member_user_ids.includes(uid)) {
          accessible.push(doc.id);
        }
        break;
      case "gallery": {
        const seatSnap = await db.collection("organization_seats").doc(`${organizationId}_${uid}`).get();
        if (seatSnap.exists && seatSnap.data()?.status === "active") {
          const did = ws.drive_id;
          if (did) {
            const dr = await db.collection("linked_drives").doc(did).get();
            if (dr.exists && dr.data()?.is_org_shared === true) {
              accessible.push(doc.id);
              break;
            }
          }
        }
        if (ws.gallery_id) {
          const gallerySnap = await db.collection("galleries").doc(ws.gallery_id).get();
          if (gallerySnap.exists && gallerySnap.data()?.photographer_id === uid) {
            accessible.push(doc.id);
          }
        }
        break;
      }
    }
  }

  return accessible;
}

/**
 * Returns workspace IDs for normal upload flow (members and admins alike).
 * Excludes other members' private workspaces - those belong in Admin Explorer only.
 * Used when mode=normal in workspaces/list.
 */
export async function getWorkspacesForNormalUpload(
  uid: string,
  organizationId: string,
  driveId: string
): Promise<string[]> {
  const db = getAdminFirestore();

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  if (!driveSnap.exists) return [];

  const driveData = driveSnap.data();
  if (driveData?.organization_id !== organizationId) return [];
  if (driveData?.deleted_at) return [];

  const currentDriveType: "storage" | "raw" | "gallery" =
    driveData?.is_creator_raw === true
      ? "raw"
      : (driveData?.name ?? "").toLowerCase().includes("gallery")
        ? "gallery"
        : "storage";

  let orgSharedDriveId: string | null = null;
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
  orgSharedDriveId = sharedByName[currentDriveType] ?? null;

  const driveIds = [driveId];
  if (orgSharedDriveId) driveIds.push(orgSharedDriveId);

  const snap = await db
    .collection("workspaces")
    .where("organization_id", "==", organizationId)
    .get();

  const ids: string[] = [];
  for (const doc of snap.docs) {
    const ws = doc.data() as Workspace;
    if (!driveIds.includes(ws.drive_id ?? "")) continue;

    const type: WorkspaceType = ws.workspace_type ?? "private";

    switch (type) {
      case "private":
        if (ws.created_by === uid) ids.push(doc.id);
        break;
      case "org_shared":
        ids.push(doc.id);
        break;
      case "team":
      case "project":
        if (Array.isArray(ws.member_user_ids) && ws.member_user_ids.includes(uid)) {
          ids.push(doc.id);
        }
        break;
      default:
        break;
    }
  }

  return ids;
}
