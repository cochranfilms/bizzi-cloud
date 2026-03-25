/**
 * POST /api/galleries/[id]/assets – add assets to gallery
 * Body: { backup_file_ids: string[], asset_origin?: 'linked' | 'gallery_storage' }
 *
 * - asset_origin linked: "From files" — cannot reference files in Gallery Media drive; deleting the asset later does not delete B2/backup_files.
 * - asset_origin gallery_storage: direct gallery upload (or omit + backup_file.gallery_id matches) — delete removes storage when last reference.
 */
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import type { GalleryAssetOrigin } from "@/types/gallery";
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
  const assetOriginBody = body.asset_origin as string | undefined;

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

  const galleryType = (gallerySnap.data()!.gallery_type === "video" ? "video" : "photo") as
    | "photo"
    | "video";

  type FileRow = { id: string; data: DocumentData };
  const fileRows: FileRow[] = [];
  for (const backupFileId of backupFileIds) {
    if (typeof backupFileId !== "string") continue;
    const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (!fileSnap.exists) continue;
    fileRows.push({ id: backupFileId, data: fileSnap.data()! });
  }

  const driveIdSet = new Set<string>();
  for (const { data: fileData } of fileRows) {
    const did = fileData.linked_drive_id as string | undefined;
    if (did) driveIdSet.add(did);
  }
  const driveNameById = new Map<string, string>();
  await Promise.all(
    [...driveIdSet].map(async (did) => {
      const d = await db.collection("linked_drives").doc(did).get();
      driveNameById.set(did, (d.data()?.name as string) ?? "");
    })
  );

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

  for (const { id: backupFileId, data: fileData } of fileRows) {
    if (fileData.userId !== uid || fileData.deleted_at) continue;

    const path = (fileData.relative_path ?? "") as string;
    const name = path.split("/").filter(Boolean).pop() ?? path ?? "file";
    const objectKey = (fileData.object_key ?? "") as string;
    const sizeBytes = (fileData.size_bytes ?? 0) as number;
    const mediaType = getMediaType(name);

    if (galleryType === "photo" && mediaType === "video") continue;
    if (galleryType === "video" && mediaType === "image") continue;

    const driveId = fileData.linked_drive_id as string | undefined;
    const driveName = driveId ? driveNameById.get(driveId) ?? "" : "";

    const resolveOrigin = (): GalleryAssetOrigin => {
      if (assetOriginBody === "linked") return "linked";
      if (assetOriginBody === "gallery_storage") return "gallery_storage";
      return (fileData.gallery_id as string | null | undefined) === galleryId
        ? "gallery_storage"
        : "linked";
    };

    const origin = resolveOrigin();

    if (origin === "linked" && driveName === "Gallery Media") {
      continue;
    }

    if (assetOriginBody === "gallery_storage") {
      const taggedForGallery =
        (fileData.gallery_id as string | null | undefined) === galleryId;
      const inGalleryMediaDrive = driveName === "Gallery Media";
      if (!taggedForGallery && !inGalleryMediaDrive) {
        continue;
      }
    }

    const assetRef = db.collection("gallery_assets").doc();
    const now = new Date();
    batch.set(assetRef, {
      gallery_id: galleryId,
      backup_file_id: backupFileId,
      object_key: objectKey,
      name,
      size_bytes: sizeBytes,
      media_type: mediaType,
      asset_origin: origin,
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
