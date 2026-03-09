/**
 * POST /api/galleries/[id]/assets – add assets to gallery
 * Body: { backup_file_ids: string[] } or { asset_ids: string[] } for existing backup_files
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import { NextResponse } from "next/server";

function getMediaType(name: string): "image" | "video" {
  return GALLERY_VIDEO_EXT.test(name) ? "video" : GALLERY_IMAGE_EXT.test(name) ? "image" : "image";
}

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
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const backupFileIds = body.backup_file_ids ?? body.asset_ids ?? [];
  if (!Array.isArray(backupFileIds) || backupFileIds.length === 0) {
    return NextResponse.json(
      { error: "backup_file_ids array is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  if (gallerySnap.data()!.photographer_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const existingSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .get();
  const maxOrder = existingSnap.docs.reduce((m, d) => {
    const o = d.data().sort_order ?? 0;
    return Math.max(m, o);
  }, -1);

  const batch = db.batch();
  let nextOrder = maxOrder + 1;
  const added: { id: string; backup_file_id: string; name: string }[] = [];

  for (const backupFileId of backupFileIds) {
    if (typeof backupFileId !== "string") continue;
    const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (!fileSnap.exists) continue;
    const fileData = fileSnap.data()!;
    if (fileData.userId !== uid || fileData.deleted_at) continue;

    const path = (fileData.relative_path ?? "") as string;
    const name = path.split("/").filter(Boolean).pop() ?? path ?? "file";
    const objectKey = (fileData.object_key ?? "") as string;
    const sizeBytes = (fileData.size_bytes ?? 0) as number;
    const mediaType = getMediaType(name);

    const assetRef = db.collection("gallery_assets").doc();
    const now = new Date();
    batch.set(assetRef, {
      gallery_id: galleryId,
      backup_file_id: backupFileId,
      object_key: objectKey,
      name,
      size_bytes: sizeBytes,
      media_type: mediaType,
      sort_order: nextOrder++,
      collection_id: null,
      is_visible: true,
      is_hero: false,
      created_at: now,
      updated_at: now,
    });
    added.push({ id: assetRef.id, backup_file_id: backupFileId, name });
  }

  await batch.commit();

  return NextResponse.json({ added });
}
