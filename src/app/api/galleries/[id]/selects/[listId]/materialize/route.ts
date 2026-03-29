/**
 * POST — Materialize a video selects proofing list into Gallery Media (photographer only).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import { materializeProofingList } from "@/lib/gallery-proofing-materialize";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; listId: string }> }
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

  const { id: galleryId, listId } = await params;
  if (!galleryId || !listId) {
    return NextResponse.json({ error: "Gallery ID and list ID required" }, { status: 400 });
  }

  let preferredWorkspaceId: string | null = null;
  try {
    const body = (await request.json().catch(() => ({}))) as { workspace_id?: string | null };
    preferredWorkspaceId = body?.workspace_id ?? null;
  } catch {
    preferredWorkspaceId = null;
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }
  const g = gallerySnap.data()!;
  if (g.gallery_type !== "video") {
    return NextResponse.json(
      { error: "Use POST /api/galleries/{id}/favorites/{listId}/materialize for photo galleries" },
      { status: 400 }
    );
  }
  if (!(await userCanManageGalleryAsPhotographer(uid, g))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const listSnap = await db.collection("favorites_lists").doc(listId).get();
  if (!listSnap.exists || listSnap.data()?.gallery_id !== galleryId) {
    return NextResponse.json({ error: "List not found" }, { status: 404 });
  }
  const lt = listSnap.data()?.list_type;
  if (lt === "photo_favorites") {
    return NextResponse.json({ error: "List is a photo favorites list" }, { status: 400 });
  }

  const result = await materializeProofingList({
    db,
    actingUid: uid,
    galleryId,
    listId,
    galleryRow: g,
    preferredWorkspaceId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    drive_id: result.drive_id,
    folder_path: result.materialized_relative_prefix,
    files_saved: result.files_saved,
    files_skipped_dedupe: result.files_skipped_dedupe,
    target_asset_count: result.target_asset_count,
    skipped_asset_count: result.skipped_asset_count,
    materialization_state: result.materialization_state,
    materialized_asset_count: result.materialized_asset_count,
  });
}
