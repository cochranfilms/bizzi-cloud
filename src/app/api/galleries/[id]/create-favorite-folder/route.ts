/**
 * POST /api/galleries/[id]/create-favorite-folder
 * Creates Gallery Media/{galleryId}/Favorites/ with shortcut backup_files (same object_key).
 * Workspace- and drive-scoped like gallery uploads. Idempotent per object_key in Favorites namespace.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import {
  GALLERY_FAVORITES_FOLDER_SEGMENT,
  loadExistingFavoriteObjectKeys,
  resolveGalleryFavoritesWriteContext,
} from "@/lib/gallery-favorites-write-context";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";

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

function normOrgId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
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

  let body: { asset_ids?: string[]; workspace_id?: string | null };
  try {
    body = (await request.json().catch(() => ({}))) as {
      asset_ids?: string[];
      workspace_id?: string | null;
    };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const assetIds = Array.isArray(body?.asset_ids) ? body.asset_ids : [];
  const preferredWorkspaceId = body?.workspace_id ?? null;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) {
    return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  }

  const g = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, g))) {
    return NextResponse.json(
      { error: "Only the gallery creator can create the favorites folder" },
      { status: 403 }
    );
  }

  const writeCtx = await resolveGalleryFavoritesWriteContext(db, uid, galleryId, g, {
    preferredWorkspaceId,
  });
  if (!("linkedDriveId" in writeCtx)) {
    return NextResponse.json({ error: writeCtx.error }, { status: writeCtx.status });
  }
  const { linkedDriveId, scopeFields } = writeCtx;
  /** Explicit null for non-org galleries — same as uploads; required for idempotency + listing composite indexes. */
  const explicitOrganizationId = normOrgId(scopeFields.organization_id ?? g.organization_id);

  type AssetRow = { object_key: string; name: string; size_bytes?: number; media_type?: string };
  let assets: AssetRow[] = [];
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
      const mt = d.media_type as string | undefined;
      assets.push({
        object_key: ok,
        name,
        size_bytes: (d.size_bytes as number) ?? 0,
        media_type: mt === "video" || mt === "image" ? mt : undefined,
      });
    }
  } else {
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
      const mt = d.media_type as string | undefined;
      assets.push({
        object_key: ok,
        name,
        size_bytes: (d.size_bytes as number) ?? 0,
        media_type: mt === "video" || mt === "image" ? mt : undefined,
      });
    }
  }

  if (assets.length === 0) {
    return NextResponse.json(
      { error: "No valid favorited assets to save" },
      { status: 400 }
    );
  }

  const existingKeys = await loadExistingFavoriteObjectKeys(
    db,
    galleryId,
    linkedDriveId,
    explicitOrganizationId
  );

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
  const toCreate: { asset: AssetRow; safeName: string }[] = [];
  let skipped = 0;
  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    if (existingKeys.has(asset.object_key)) {
      skipped++;
      continue;
    }
    toCreate.push({ asset, safeName: uniqueNames[i] });
  }

  if (toCreate.length === 0) {
    return NextResponse.json({
      ok: true,
      drive_id: linkedDriveId,
      folder_path: `${galleryId}/${GALLERY_FAVORITES_FOLDER_SEGMENT}`,
      files_saved: 0,
      files_skipped: skipped,
    });
  }

  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: linkedDriveId,
    userId: uid,
    status: "completed",
    files_count: toCreate.length,
    bytes_synced: 0,
    completed_at: now,
  });

  const batch = db.batch();
  const newFileIds: string[] = [];
  for (const { asset, safeName } of toCreate) {
    const relativePath = `${galleryId}/${GALLERY_FAVORITES_FOLDER_SEGMENT}/${safeName}`;
    const fileRef = db.collection("backup_files").doc();
    newFileIds.push(fileRef.id);
    const row: Record<string, unknown> = {
      backup_snapshot_id: snapshotRef.id,
      linked_drive_id: linkedDriveId,
      relative_path: relativePath,
      object_key: asset.object_key,
      size_bytes: asset.size_bytes ?? 0,
      content_type: getContentType(safeName),
      modified_at: now,
      uploaded_at: now,
      deleted_at: null,
      lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
      gallery_id: galleryId,
      ...scopeFields,
      ...macosPackageFirestoreFieldsFromRelativePath(relativePath),
      organization_id: explicitOrganizationId,
    };
    if (asset.media_type) {
      row.media_type = asset.media_type;
    }
    batch.set(fileRef, row);
  }

  await batch.commit();

  await Promise.all(
    newFileIds.map((fid) =>
      linkBackupFileToMacosPackageContainer(db, fid).catch((err) => {
        console.error("[create-favorite-folder] macos package link:", fid, err);
      })
    )
  );

  await db.collection("linked_drives").doc(linkedDriveId).update({
    last_synced_at: now,
  });

  return NextResponse.json({
    ok: true,
    drive_id: linkedDriveId,
    folder_path: `${galleryId}/${GALLERY_FAVORITES_FOLDER_SEGMENT}`,
    files_saved: toCreate.length,
    files_skipped: skipped,
  });
}
