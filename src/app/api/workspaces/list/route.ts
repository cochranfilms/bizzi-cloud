/**
 * GET /api/workspaces/list?organization_id=...&drive_id=... (optional)
 * Returns workspaces the user can access in the org.
 * Used by WorkspaceSelector and drive navigation.
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-access";
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

  const accessibleIds = await getAccessibleWorkspaceIds(uid, organizationId);
  if (accessibleIds.length === 0) {
    return NextResponse.json({ workspaces: [] });
  }

  const db = getAdminFirestore();
  const IN = Math.min(30, accessibleIds.length);
  const ids = accessibleIds.slice(0, IN);
  const snaps = await Promise.all(
    ids.map((id) => db.collection("workspaces").doc(id).get())
  );

  let orgSharedDriveId: string | null = null;
  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    const driveData = driveSnap.data();
    const currentDriveType =
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
    orgSharedDriveId =
      sharedByName[currentDriveType as keyof typeof sharedByName] ?? null;
  }

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
    })
    .filter(
      (w) =>
        !driveId ||
        w.drive_id === driveId ||
        (orgSharedDriveId !== null && w.drive_id === orgSharedDriveId)
    );

  return NextResponse.json({ workspaces });
}
