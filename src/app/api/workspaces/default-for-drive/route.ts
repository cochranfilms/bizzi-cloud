/**
 * GET /api/workspaces/default-for-drive?drive_id=...&organization_id=...&workspace_id=... (optional)
 * Resolves workspace for upload. Returns workspace_id, drive_id, workspace_name.
 * If workspace_id provided: validates write access, returns that workspace.
 * Else: returns My Private for the drive.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
import { visibilityScopeFromWorkspaceType, scopeLabelFromScope } from "@/lib/workspace-visibility";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

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

  if (workspaceIdParam) {
    const canWrite = await userCanWriteWorkspace(uid, workspaceIdParam);
    if (!canWrite) {
      return NextResponse.json({ error: "No write access to workspace" }, { status: 403 });
    }
    const db = getAdminFirestore();
    const wsSnap = await db.collection("workspaces").doc(workspaceIdParam).get();
    if (!wsSnap.exists) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const data = wsSnap.data();
    const wsDriveId = (data?.drive_id as string) ?? driveId;
    const wsName = (data?.name as string) ?? "Workspace";
    const wsType = (data?.workspace_type as string) ?? "private";
    const scope = visibilityScopeFromWorkspaceType(wsType);
    return NextResponse.json({
      workspace_id: workspaceIdParam,
      drive_id: wsDriveId,
      workspace_name: wsName,
      visibility_scope: scope,
      scope_label: scopeLabelFromScope(scope),
    });
  }

  const workspaceId = await getOrCreateMyPrivateWorkspaceId(uid, organizationId, driveId);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Drive not found or not in org" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    workspace_id: workspaceId,
    drive_id: driveId,
    workspace_name: "My Private",
    visibility_scope: "private_org",
    scope_label: "Private",
  });
}
