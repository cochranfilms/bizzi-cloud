/**
 * Resolve workspace_id + visibility_scope for org member pillar drives (Gallery Media, etc.).
 * Mirrors GET /api/workspaces/default-for-drive — used server-side by Create Favorite Folder.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { getOrgSharedUploadTarget, resolveEnterprisePillarDriveIds } from "@/lib/org-pillar-drives";
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

  const sharedTarget = await getOrgSharedUploadTarget(organizationId, memberDriveId);
  if (sharedTarget) {
    return {
      ok: true,
      workspace_id: sharedTarget.workspaceId,
      visibility_scope: visibilityScopeFromWorkspaceType("org_shared"),
    };
  }

  const workspaceId = await getOrCreateMyPrivateWorkspaceId(uid, organizationId, memberDriveId);
  if (!workspaceId) {
    return { ok: false, error: "Drive not found or not in org", status: 404 };
  }

  return { ok: true, workspace_id: workspaceId, visibility_scope: "private_org" };
}
