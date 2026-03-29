/**
 * POST — Merge all active proofing lists into a new Gallery Media snapshot folder (_merged/{merge_slug}/).
 * Photographer only. Each call creates a new merge folder.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import { mergeAllProofingLists } from "@/lib/gallery-proofing-merge-all";
import { parseShellContextHeader } from "@/lib/gallery-proofing-types";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { id: galleryId } = await params;
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  let preferredWorkspaceId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { workspace_id?: string | null };
    preferredWorkspaceId = body?.workspace_id ?? null;
  } catch {
    preferredWorkspaceId = null;
  }

  const shellContext = parseShellContextHeader(request.headers.get("X-Bizzi-Shell"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }
  const g = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, g))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const result = await mergeAllProofingLists({
    db,
    actingUid: uid,
    galleryId,
    galleryRow: g,
    preferredWorkspaceId,
    shellContext,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    merge_run_id: result.merge_run_id,
    merge_slug: result.merge_slug,
    drive_id: result.drive_id,
    merge_relative_prefix: result.merge_relative_prefix,
    files_saved: result.files_saved,
    target_asset_count: result.target_asset_count,
    skipped_asset_count: result.skipped_asset_count,
    materialization_state: result.materialization_state,
  });
}
