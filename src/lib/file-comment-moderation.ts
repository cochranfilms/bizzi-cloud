import { getAdminFirestore } from "@/lib/firebase-admin";
import { PERSONAL_TEAM_SEATS_COLLECTION } from "@/lib/personal-team-constants";
import { isOrgAdmin } from "@/lib/workspace-access";

/**
 * Team owner, org admin, or file owner may moderate (delete) any comment on that file.
 */
export async function canModerateFileComment(
  uid: string,
  fileId: string
): Promise<boolean> {
  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  if (!fileSnap.exists) return false;
  const fd = fileSnap.data()!;
  const ownerId = fd.userId as string;
  if (ownerId === uid) return true;

  const orgId = fd.organization_id as string | undefined;
  if (orgId && (await isOrgAdmin(uid, orgId))) return true;

  const pto = fd.personal_team_owner_id as string | undefined;
  if (pto && pto === uid) return true;

  return false;
}

/**
 * Team owner or fullframe seat may list team comment activity (oversight).
 */
export async function canViewTeamCommentActivity(
  teamOwnerUid: string,
  viewerUid: string
): Promise<boolean> {
  if (viewerUid === teamOwnerUid) return true;
  const db = getAdminFirestore();
  const seat = await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(`${teamOwnerUid}_${viewerUid}`).get();
  if (!seat.exists || seat.data()?.status !== "active") return false;
  const level = seat.data()?.seat_access_level as string | undefined;
  return level === "fullframe";
}

/**
 * Org admin may list org-scoped comment activity.
 */
export async function canViewOrgCommentActivity(
  organizationId: string,
  viewerUid: string
): Promise<boolean> {
  return isOrgAdmin(viewerUid, organizationId);
}
