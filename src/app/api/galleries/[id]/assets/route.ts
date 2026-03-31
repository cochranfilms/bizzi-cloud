/**
 * GET /api/galleries/[id]/assets – manager-only full asset list (includes hidden / is_visible false).
 * Supports weak ETag + If-None-Match → 304, and ?sinceVersion= → 200 JSON when unchanged.
 * Does not increment gallery view_count.
 *
 * POST /api/galleries/[id]/assets – add assets to gallery
 * Body: { backup_file_ids: string[], asset_origin?: 'linked' | 'gallery_storage' }
 */
import type { DocumentData } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import type { GalleryAssetOrigin } from "@/types/gallery";
import { NextResponse } from "next/server";
import { userCanManageGalleryAsPhotographer } from "@/lib/gallery-owner-access";
import { canLinkBackupFileToGallery } from "@/lib/gallery-asset-link-access";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  bumpGalleryAssetsVersion,
  fireAndForgetGalleryAssetActivity,
  getRequestCorrelationId,
  readAssetsVersion,
  weakEtagForGalleryAssets,
  ifNoneMatchIndicatesUnchanged,
} from "@/lib/gallery-asset-mutations";

const MANAGE_ASSETS_GET_LIMIT_PER_MINUTE = 180;

function parseSinceVersion(url: URL): number | null {
  const raw = url.searchParams.get("sinceVersion");
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const t0 = performance.now();
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

  const rl = checkRateLimit(
    `gallery-assets-get:${uid}:${galleryId}`,
    MANAGE_ASSETS_GET_LIMIT_PER_MINUTE,
    60_000
  );
  if (!rl.allowed) {
    const retryAfter = Math.max(0, Math.ceil((rl.resetAt - Date.now()) / 1000) * 1000);
    return NextResponse.json(
      {
        error: "Too many requests",
        code: "rate_limited",
        retry_after_ms: retryAfter,
      },
      { status: 429 }
    );
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });
  const galleryRow = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, galleryRow))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const currentVersion = readAssetsVersion(galleryRow);
  const url = new URL(request.url);
  const sinceV = parseSinceVersion(url);

  const baseHeaders = new Headers({
    "Cache-Control": "private, no-store",
    ETag: weakEtagForGalleryAssets(galleryId, currentVersion),
    "X-Gallery-Assets-Version": String(currentVersion),
  });

  if (sinceV !== null && currentVersion === sinceV) {
    const dur = Math.round(performance.now() - t0);
    baseHeaders.set("Server-Timing", `auth;dur=${dur}`);
    console.info(
      JSON.stringify({
        msg: "gallery_manage_assets_get",
        galleryId,
        uid,
        status: 200,
        mode: "since_version_unchanged",
        assets_version: currentVersion,
        duration_ms: dur,
      })
    );
    return new NextResponse(
      JSON.stringify({
        unchanged: true,
        assets_version: currentVersion,
      }),
      { status: 200, headers: { ...Object.fromEntries(baseHeaders), "Content-Type": "application/json" } }
    );
  }

  const etag = weakEtagForGalleryAssets(galleryId, currentVersion);
  const inm = request.headers.get("If-None-Match");
  if (ifNoneMatchIndicatesUnchanged(inm, etag)) {
    const dur = Math.round(performance.now() - t0);
    baseHeaders.set("Server-Timing", `auth;dur=${dur}`);
    console.info(
      JSON.stringify({
        msg: "gallery_manage_assets_get",
        galleryId,
        uid,
        status: 304,
        mode: "etag_unchanged",
        assets_version: currentVersion,
        duration_ms: dur,
      })
    );
    return new NextResponse(null, { status: 304, headers: baseHeaders });
  }

  const assetsSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .orderBy("sort_order", "asc")
    .get();

  const assets = assetsSnap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id,
      name: a.name,
      media_type: a.media_type ?? "image",
      object_key: a.object_key,
      collection_id: a.collection_id ?? null,
      sort_order: a.sort_order ?? 0,
      proofing_status: a.proofing_status ?? "pending",
      duration: a.duration ?? null,
      is_downloadable: a.is_downloadable ?? null,
      is_visible: a.is_visible !== false,
    };
  });

  const body = JSON.stringify({ assets, assets_version: currentVersion });
  const dur = Math.round(performance.now() - t0);
  baseHeaders.set("Server-Timing", `total;dur=${dur}`);
  console.info(
    JSON.stringify({
      msg: "gallery_manage_assets_get",
      galleryId,
      uid,
      status: 200,
      mode: "full",
      assets_version: currentVersion,
      asset_count: assets.length,
      duration_ms: dur,
      payload_bytes: Buffer.byteLength(body, "utf8"),
    })
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      ...Object.fromEntries(baseHeaders),
      "Content-Type": "application/json",
    },
  });
}

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
  const galleryRow = gallerySnap.data()!;
  if (!(await userCanManageGalleryAsPhotographer(uid, galleryRow))) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const correlationId = getRequestCorrelationId(request);

  const galleryType = (galleryRow.gallery_type === "video" ? "video" : "photo") as
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
    if (!(await canLinkBackupFileToGallery(uid, fileData, galleryRow))) continue;

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

  let newVersion = readAssetsVersion(galleryRow);
  if (added.length > 0) {
    newVersion = await bumpGalleryAssetsVersion(db, galleryId);
    fireAndForgetGalleryAssetActivity({
      event_type: "gallery_asset_added",
      actor_user_id: uid,
      gallery: galleryRow,
      gallery_id: galleryId,
      correlation_id: correlationId,
      metadata: {
        added_count: added.length,
        asset_ids: added.map((a) => a.id),
        backup_file_ids: added.map((a) => a.backup_file_id),
        asset_origin: assetOriginBody ?? null,
        assets_version: newVersion,
      },
    });
  }

  return NextResponse.json({ added, assets_version: newVersion });
}
