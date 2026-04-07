/**
 * Resolve workspace_id + visibility_scope for org member pillar drives (Gallery Media, etc.).
 * Mirrors GET /api/workspaces/default-for-drive — used server-side by Create Favorite Folder.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { resolveEnterprisePillarDriveIds } from "@/lib/org-pillar-drives";
import { visibilityScopeFromWorkspaceType } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";

export type ResolveWorkspaceForOrgMemberDriveResult =
  | { ok: true; workspace_id: string; visibility_scope: string }
  | { ok: false; error: string; status: number };

export async function resolveWorkspaceForOrgMemberDrive(
  uid: string,
  organizationId: string,
  memberDriveId: string,
  preferredWorkspaceId?: string | null
): Promise<ResolveWorkspaceForOrgMemberDriveResult> {
  const db = getAdminFirestore();

  if (preferredWorkspaceId != null && String(preferredWorkspaceId).trim() !== "") {
    const wid = String(preferredWorkspaceId).trim();
    const canWrite = await userCanWriteWorkspace(uid, wid);
    if (!canWrite) {
      return { ok: false, error: "No write access to workspace", status: 403 };
    }
    const wsSnap = await db.collection("workspaces").doc(wid).get();
    if (!wsSnap.exists) {
      return { ok: false, error: "Workspace not found", status: 404 };
    }
    const wsData = wsSnap.data()!;
    const wsOrg = wsData.organization_id as string | undefined;
    if (wsOrg !== organizationId) {
      return { ok: false, error: "Workspace does not belong to this organization", status: 400 };
    }
    const wsDriveId = (wsData.drive_id as string) ?? memberDriveId;
    const pillarIds = await resolveEnterprisePillarDriveIds(organizationId, memberDriveId);
    if (!pillarIds.includes(wsDriveId)) {
      return {
        ok: false,
        error: "Workspace is not on this gallery media drive (or its org shared pillar)",
        status: 400,
      };
    }
    const wsType = (wsData.workspace_type as string) ?? "private";
    return {
      ok: true,
      workspace_id: wid,
      visibility_scope: visibilityScopeFromWorkspaceType(wsType),
    };
  }

  const driveSnap = await db.collection("linked_drives").doc(memberDriveId).get();
  const dd = driveSnap.data();
  if (!driveSnap.exists || !dd) {
    return { ok: false, error: "Drive not found", status: 404 };
  }
  if ((dd.organization_id as string | undefined) !== organizationId) {
    return { ok: false, error: "Drive does not belong to this organization", status: 400 };
  }

  const ownerUid = (dd.userId ?? dd.user_id) as string | undefined;
  const isShared = dd.is_org_shared === true;

  if (isShared) {
    const wsSnap = await db
      .collection("workspaces")
      .where("organization_id", "==", organizationId)
      .where("drive_id", "==", memberDriveId)
      .where("workspace_type", "==", "org_shared")
      .limit(1)
      .get();
    if (wsSnap.empty) {
      return { ok: false, error: "Shared workspace not found", status: 404 };
    }
    return {
      ok: true,
      workspace_id: wsSnap.docs[0].id,
      visibility_scope: visibilityScopeFromWorkspaceType("org_shared"),
    };
  }

  if (ownerUid === uid) {
    const workspaceId = await getOrCreateMyPrivateWorkspaceId(uid, organizationId, memberDriveId);
    if (!workspaceId) {
      return { ok: false, error: "Drive not found or not in org", status: 404 };
    }
    return { ok: true, workspace_id: workspaceId, visibility_scope: "private_org" };
  }

  return { ok: false, error: "No access to this drive", status: 403 };
}
