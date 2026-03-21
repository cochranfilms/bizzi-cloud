/**
 * POST /api/galleries/[id]/create-favorite-folder
 * Creates Gallery Media/{galleryId}/favorites/ and saves favorited assets there.
 * Creator-only. References existing B2 objects (no copy).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

function getContentType(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    tiff: "image/tiff",
    tif: "image/tiff",
    heic: "image/heic",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    avi: "video/x-msvideo",
    prproj: "application/x-adobe-premiere-project",
    premiereproject: "application/x-adobe-premiere-project",
    fcpxml: "application/xml",
    fcpbundle: "application/octet-stream",
    drp: "application/x-davinci-resolve-project",
    dra: "application/octet-stream",
    drt: "application/octet-stream",
    aep: "application/x-adobe-after-effects",
    mogrt: "application/octet-stream",
    otio: "application/json",
    edl: "text/plain",
    aaf: "application/octet-stream",
    srt: "text/plain",
    vtt: "text/vtt",
    cube: "application/octet-stream",
    cdl: "application/xml",
    ale: "text/plain",
  };
  return mime[ext] ?? "application/octet-stream";
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
  if (!galleryId) {
    return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });
  }

  let body: { asset_ids?: string[] };
  try {
    body = (await request.json().catch(() => ({}))) as { asset_ids?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const assetIds = Array.isArray(body?.asset_ids) ? body.asset_ids : [];

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const g = gallerySnap.data()!;
  if (g.photographer_id !== uid) {
    return NextResponse.json({ error: "Only the gallery creator can create the favorites folder" }, { status: 403 });
  }

  // Get or create Gallery Media drive
  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", uid)
    .get();

  const galleryDrive = drivesSnap.docs.find(
    (d) => !d.data().deleted_at && d.data().name === "Gallery Media"
  );

  let galleryDriveId: string;
  if (galleryDrive) {
    galleryDriveId = galleryDrive.id;
  } else {
    const newDrive = await db.collection("linked_drives").add({
      userId: uid,
      name: "Gallery Media",
      permission_handle_id: `gallery-media-${Date.now()}`,
      createdAt: new Date(),
      organization_id: null,
    });
    galleryDriveId = newDrive.id;
  }

  // Get favorited assets (if asset_ids provided) or all assets with favorites
  let assets: { object_key: string; name: string; size_bytes?: number }[] = [];
  if (assetIds.length > 0) {
    const assetSnaps = await Promise.all(
      assetIds.map((aid) => db.collection("gallery_assets").doc(aid).get())
    );
    for (const snap of assetSnaps) {
      if (!snap.exists) continue;
      const d = snap.data()!;
      const name = (d.name as string) ?? "download";
      if (!(IMAGE_EXT.test(name) || VIDEO_EXT.test(name))) continue;
      const ok = d.object_key as string;
      if (!ok) continue;
      assets.push({
        object_key: ok,
        name,
        size_bytes: (d.size_bytes as number) ?? 0,
      });
    }
  } else {
    // No asset_ids: fetch from favorites lists
    const favSnap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", galleryId)
      .get();
    const allFavIds = new Set<string>();
    favSnap.docs.forEach((d) => {
      ((d.data().asset_ids as string[]) ?? []).forEach((id: string) => allFavIds.add(id));
    });
    if (allFavIds.size === 0) {
      return NextResponse.json(
        { error: "No favorited photos. Add favorites first, or pass asset_ids." },
        { status: 400 }
      );
    }
    const assetSnaps = await Promise.all(
      Array.from(allFavIds).map((aid) => db.collection("gallery_assets").doc(aid).get())
    );
    for (const snap of assetSnaps) {
      if (!snap.exists) continue;
      const d = snap.data()!;
      const name = (d.name as string) ?? "download";
      if (!(IMAGE_EXT.test(name) || VIDEO_EXT.test(name))) continue;
      const ok = d.object_key as string;
      if (!ok) continue;
      assets.push({
        object_key: ok,
        name,
        size_bytes: (d.size_bytes as number) ?? 0,
      });
    }
  }

  if (assets.length === 0) {
    return NextResponse.json(
      { error: "No valid favorited assets to save" },
      { status: 400 }
    );
  }

  // Dedupe filenames in folder
  const usedNames = new Map<string, number>();
  const uniqueNames = assets.map((a) => {
    let finalName = a.name;
    const base = a.name.replace(/\.([^.]+)$/, "");
    const ext = a.name.includes(".") ? a.name.slice(a.name.lastIndexOf(".")) : "";
    let n = 0;
    while (usedNames.has(finalName)) {
      n++;
      finalName = `${base} (${n})${ext}`;
    }
    usedNames.set(finalName, 1);
    return finalName;
  });

  const now = new Date().toISOString();
  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: galleryDriveId,
    userId: uid,
    status: "completed",
    files_count: assets.length,
    bytes_synced: 0,
    completed_at: now,
  });

  const batch = db.batch();
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const safeName = uniqueNames[i];
    const relativePath = `${galleryId}/favorites/${safeName}`;

    const fileRef = db.collection("backup_files").doc();
    batch.set(fileRef, {
      backup_snapshot_id: snapshotRef.id,
      linked_drive_id: galleryDriveId,
      userId: uid,
      relative_path: relativePath,
      object_key: asset.object_key,
      size_bytes: asset.size_bytes ?? 0,
      content_type: getContentType(safeName),
      modified_at: now,
      deleted_at: null,
      organization_id: null,
      gallery_id: galleryId,
    });
  }

  await batch.commit();

  // Update drive last_synced
  await db.collection("linked_drives").doc(galleryDriveId).update({
    last_synced_at: now,
  });

  return NextResponse.json({
    ok: true,
    drive_id: galleryDriveId,
    folder_path: `${galleryId}/favorites`,
    files_saved: assets.length,
  });
}
