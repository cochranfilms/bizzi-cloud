/**
 * GET /api/workspaces/list?organization_id=...&drive_id=... (required for results)
 * Returns workspaces the user can access for the given org drive (upload / file flows).
 */
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import { getWorkspacesForNormalUpload } from "@/lib/workspace-access";
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
  const organizationId = url.searchParams.get("organization_id") ?? url.searchParams.get("organizationId");
  const driveId = url.searchParams.get("drive_id") ?? url.searchParams.get("driveId");

  if (!organizationId) {
    return NextResponse.json(
      { error: "organization_id required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  if (!driveId) {
    return NextResponse.json({ workspaces: [] });
  }

  const accessibleIds = await getWorkspacesForNormalUpload(uid, organizationId, driveId);
  if (accessibleIds.length === 0) {
    return NextResponse.json({ workspaces: [] });
  }

  const snaps = await Promise.all(
    accessibleIds.map((id) => db.collection("workspaces").doc(id).get())
  );

  const workspaces = snaps
    .filter((s) => s.exists)
    .map((s) => {
      const d = s!.data()!;
      return {
        id: s!.id,
        name: d.name ?? "Workspace",
        workspace_type: d.workspace_type ?? "private",
        drive_id: d.drive_id ?? null,
        drive_type: d.drive_type ?? null,
      };
    });

  return NextResponse.json({ workspaces });
}
