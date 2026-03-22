/**
 * GET /api/workspaces/default-for-drive?drive_id=...&organization_id=...
 * Returns the "My Private" workspace ID for the drive in org context.
 * Used by client when creating backup_files directly (e.g. BackupContext sync).
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getOrCreateMyPrivateWorkspaceId } from "@/lib/ensure-default-workspaces";
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

  if (!driveId || !organizationId) {
    return NextResponse.json(
      { error: "drive_id and organization_id required" },
      { status: 400 }
    );
  }

  const workspaceId = await getOrCreateMyPrivateWorkspaceId(uid, organizationId, driveId);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Drive not found or not in org" },
      { status: 404 }
    );
  }

  return NextResponse.json({ workspace_id: workspaceId });
}
