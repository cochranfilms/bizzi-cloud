/**
 * GET /api/workspaces/list?organization_id=...&drive_id=... (optional)&mode=normal|admin
 * Returns workspaces the user can access in the org.
 * mode=normal (default): For main upload flow - only user's private, org shared, project/team.
 *   When drive_id is null, returns empty (drive-first).
 * mode=admin: For Admin Explorer - all accessible workspaces, includes created_by for private.
 */
import { verifyIdToken, getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { getAccessibleWorkspaceIds, getWorkspacesForNormalUpload } from "@/lib/workspace-access";
import { NextResponse } from "next/server";

/** Resolve owner UID to display name: org seat > profile > Firebase Auth > fallback */
async function resolveOwnerDisplayName(
  db: Awaited<ReturnType<typeof getAdminFirestore>>,
  auth: Awaited<ReturnType<typeof getAdminAuth>>,
  orgId: string,
  ownerId: string
): Promise<string> {
  const seatDoc = await db.collection("organization_seats").doc(`${orgId}_${ownerId}`).get();
  if (seatDoc.exists) {
    const d = seatDoc.data();
    const displayName = (d?.display_name as string)?.trim();
    const email = (d?.email as string)?.trim();
    if (displayName) return displayName;
    if (email) return email;
  }
  const profileSnap = await db.collection("profiles").doc(ownerId).get();
  if (profileSnap.exists) {
    const d = profileSnap.data();
    const name = (d?.display_name ?? d?.displayName) as string;
    if (name?.trim()) return name.trim();
  }
  try {
    const userRecord = await auth.getUser(ownerId);
    if (userRecord.displayName?.trim()) return userRecord.displayName.trim();
    if (userRecord.email) return userRecord.email;
  } catch {
    // Auth lookup failed
  }
  return "Unknown member";
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
  const organizationId = url.searchParams.get("organization_id") ?? url.searchParams.get("organizationId");
  const driveId = url.searchParams.get("drive_id") ?? url.searchParams.get("driveId");
  const mode = (url.searchParams.get("mode") ?? "normal") as "normal" | "admin";

  if (!organizationId) {
    return NextResponse.json(
      { error: "organization_id required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  if (mode === "normal") {
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

  // Admin mode: full org list for Admin Explorer
  const accessibleIds = await getAccessibleWorkspaceIds(uid, organizationId);
  if (accessibleIds.length === 0) {
    return NextResponse.json({ workspaces: [] });
  }

  const idsToFetch = driveId
    ? accessibleIds
    : accessibleIds.slice(0, Math.min(100, accessibleIds.length));
  const snaps = await Promise.all(
    idsToFetch.map((id) => db.collection("workspaces").doc(id).get())
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

  let workspaces = snaps
    .filter((s) => s.exists)
    .map((s) => {
      const d = s!.data()!;
      const base = {
        id: s!.id,
        name: d.name ?? "Workspace",
        workspace_type: d.workspace_type ?? "private",
        drive_id: d.drive_id ?? null,
        drive_type: d.drive_type ?? null,
      };
      if (d.workspace_type === "private" && d.created_by) {
        return { ...base, created_by: d.created_by };
      }
      return base;
    })
    .filter(
      (w) =>
        !driveId ||
        w.drive_id === driveId ||
        (orgSharedDriveId !== null && w.drive_id === orgSharedDriveId)
    );

  const ownerIds = [...new Set(workspaces.map((w) => (w as { created_by?: string }).created_by).filter(Boolean))] as string[];
  const auth = getAdminAuth();
  const ownerNames = new Map<string, string>();
  await Promise.all(
    ownerIds.map(async (id) => {
      const name = await resolveOwnerDisplayName(db, auth, organizationId, id);
      ownerNames.set(id, name);
    })
  );

  workspaces = workspaces.map((w) => {
    const createdBy = (w as { created_by?: string }).created_by;
    if (createdBy) {
      return { ...w, owner_display_name: ownerNames.get(createdBy) ?? "Unknown member" };
    }
    return w;
  });

  return NextResponse.json({ workspaces });
}
