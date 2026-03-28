/**
 * GET /api/workspaces/default-for-drive?drive_id=...&organization_id=...&workspace_id=... (optional)
 * Resolves workspace for upload. Returns workspace_id, drive_id, workspace_name.
 * If workspace_id provided: validates write access, returns that workspace.
 * Else: returns the org shared workspace for the pillar when it exists; otherwise My Private for the drive.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { getOrgSharedUploadTarget } from "@/lib/org-pillar-drives";
import { visibilityScopeFromWorkspaceType, scopeLabelFromScope } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { getDisplayLabel } from "@/lib/workspace-display-labels";
import { NextResponse } from "next/server";

function getDriveType(driveData: { name?: string; is_creator_raw?: boolean }): "storage" | "raw" | "gallery" {
  if (driveData?.is_creator_raw === true) return "raw";
  const name = (driveData.name ?? "").toLowerCase();
  if (name.includes("gallery")) return "gallery";
  return "storage";
}

function deny(
  uid: string,
  organizationId: string,
  reason: string,
  status: number
): NextResponse {
  logEnterpriseSecurityEvent("default_for_drive_denied", {
    uid,
    orgId: organizationId,
    route: "workspaces/default-for-drive",
    reason,
  });
  return NextResponse.json({ error: "Forbidden" }, { status });
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const driveId = url.searchParams.get("drive_id") ?? url.searchParams.get("driveId");
  const organizationId = url.searchParams.get("organization_id") ?? url.searchParams.get("organizationId");
  const workspaceIdParam = url.searchParams.get("workspace_id") ?? null;

  if (!driveId || !organizationId) {
    return NextResponse.json(
      { error: "drive_id and organization_id required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  if (!driveSnap.exists || driveSnap.data()?.deleted_at) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }
  const driveData = driveSnap.data()!;
  const driveOrgId = driveData.organization_id as string | undefined;
  if (driveOrgId !== organizationId) {
    return deny(uid, organizationId, "drive_org_mismatch", 403);
  }

  const access = await resolveEnterpriseAccess(uid, organizationId);
  if (!access.canAccessEnterprise) {
    return deny(uid, organizationId, access.denialReason ?? "not_member", 403);
  }

  if (workspaceIdParam) {
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdParam);
    if (!canWrite) {
      return deny(uid, organizationId, "no_write_workspace", 403);
    }
    const wsSnap = await db.collection("workspaces").doc(workspaceIdParam).get();
    if (!wsSnap.exists) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const data = wsSnap.data();
    if ((data?.organization_id as string | undefined) !== organizationId) {
      return deny(uid, organizationId, "workspace_org_mismatch", 403);
    }
    const wsDriveId = (data?.drive_id as string) ?? driveId;
    const wsType = (data?.workspace_type as string) ?? "private";
    const wsDriveType = (data?.drive_type as string) ?? "storage";
    const scope = visibilityScopeFromWorkspaceType(wsType);
    const displayName = getDisplayLabel(
      { name: data?.name as string, workspace_type: wsType, drive_type: wsDriveType },
      null
    );
    let driveName = "Drive";
    const wsDriveSnap = await db.collection("linked_drives").doc(wsDriveId).get();
    if (wsDriveSnap.exists) {
      const dn = wsDriveSnap.data()?.name;
      driveName =
        dn === "RAW" || wsDriveSnap.data()?.is_creator_raw ? "RAW" : (dn ?? "Drive");
    }
    return NextResponse.json({
      workspace_id: workspaceIdParam,
      drive_id: wsDriveId,
      drive_name: driveName,
      workspace_name: displayName,
      visibility_scope: scope,
      scope_label: scopeLabelFromScope(scope),
    });
  }

  const sharedTarget = await getOrgSharedUploadTarget(organizationId, driveId);
  if (sharedTarget) {
    const wsSnap = await db.collection("workspaces").doc(sharedTarget.workspaceId).get();
    const wsData = wsSnap.data();
    const sharedDriveSnap = await db.collection("linked_drives").doc(sharedTarget.sharedDriveId).get();
    const sharedDriveData = sharedDriveSnap.exists ? sharedDriveSnap.data() : {};
    const driveType = getDriveType(sharedDriveData ?? {});
    const scope = visibilityScopeFromWorkspaceType("org_shared");
    const displayName = getDisplayLabel(
      {
        name: (wsData?.name as string) ?? "Shared Library",
        workspace_type: "org_shared",
        drive_type: driveType,
      },
      null
    );
    const driveName =
      driveType === "raw" ? "RAW" : driveType === "gallery" ? "Gallery Media" : "Storage";
    return NextResponse.json({
      workspace_id: sharedTarget.workspaceId,
      drive_id: sharedTarget.sharedDriveId,
      drive_name: driveName,
      workspace_name: displayName,
      visibility_scope: scope,
      scope_label: scopeLabelFromScope(scope),
    });
  }

  const driveType = getDriveType(driveData);
  const driveUserId = (driveData.userId ?? driveData.user_id) as string | undefined;
  if (driveUserId !== uid) {
    return deny(uid, organizationId, "private_requires_own_drive", 403);
  }

  const workspaceId = await getOrCreateMyPrivateWorkspaceId(uid, organizationId, driveId);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Drive not found or not in org" },
      { status: 404 }
    );
  }

  const displayName = getDisplayLabel(
    { name: "My Private", workspace_type: "private", drive_type: driveType },
    null
  );

  const driveName =
    driveType === "raw" ? "RAW" : driveType === "gallery" ? "Gallery Media" : "Storage";

  return NextResponse.json({
    workspace_id: workspaceId,
    drive_id: driveId,
    drive_name: driveName,
    workspace_name: displayName,
    visibility_scope: "private_org",
    scope_label: "Private",
  });
}
