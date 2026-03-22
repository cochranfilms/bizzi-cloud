/**
 * POST /api/enterprise/ensure-shared-workspaces
 * Creates or ensures org shared drives (Shared Storage, Shared RAW, Shared Gallery)
 * and their workspaces (Shared Library, Shared RAW, Shared Gallery).
 * Org admin only. Idempotent - safe to call repeatedly.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { ensureOrgSharedDrives } from "@/lib/ensure-default-drives";
import { ensureSharedWorkspacesForOrg } from "@/lib/ensure-default-workspaces";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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

  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const profileData = profileSnap.data();
  const orgId = profileData?.organization_id as string | undefined;
  const orgRole = profileData?.organization_role as string | undefined;

  if (!orgId || orgRole !== "admin") {
    return NextResponse.json(
      { error: "You must be an organization admin" },
      { status: 403 }
    );
  }

  const seatSnap = await db.collection("organization_seats").doc(`${orgId}_${uid}`).get();
  if (!seatSnap.exists || seatSnap.data()?.role !== "admin") {
    return NextResponse.json(
      { error: "You must be an organization admin" },
      { status: 403 }
    );
  }

  try {
    const sharedDriveIds = await ensureOrgSharedDrives(orgId, uid);
    await ensureSharedWorkspacesForOrg(orgId, sharedDriveIds);
  } catch (err) {
    console.error("[ensure-shared-workspaces] Failed:", err);
    return NextResponse.json(
      { error: "Failed to set up shared workspaces" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
