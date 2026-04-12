/**
 * POST multipart: user-captured video frame → grid poster JPEG (same B2 key as GET video-thumbnail).
 */
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  getVideoThumbnailCacheKey,
  isB2Configured,
  putObject,
} from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import {
  VIDEO_POSTER_HEIGHT,
  VIDEO_POSTER_WIDTH,
} from "@/lib/video-poster-frame";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const maxDuration = 60;

const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const objectKeyRaw = form.get("object_key");
  const backupFileIdRaw = form.get("backup_file_id");
  const seekRaw = form.get("seek_sec");
  const image = form.get("image");

  const objectKey = typeof objectKeyRaw === "string" ? objectKeyRaw.trim() : "";
  const backupFileId = typeof backupFileIdRaw === "string" ? backupFileIdRaw.trim() : "";
  if (!objectKey || !backupFileId) {
    return NextResponse.json({ error: "object_key and backup_file_id required" }, { status: 400 });
  }

  if (!(image instanceof File) || image.size < 32) {
    return NextResponse.json({ error: "image file required" }, { status: 400 });
  }
  if (image.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "image too large" }, { status: 413 });
  }

  let seekSec = 0.5;
  if (typeof seekRaw === "string" && seekRaw.trim()) {
    const n = Number(seekRaw);
    if (Number.isFinite(n) && n >= 0 && n <= 864_000) seekSec = n;
  }

  const access = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.message ?? "Access denied" },
      { status: access.status ?? 403 }
    );
  }

  const db = getAdminFirestore();
  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const row = fileSnap.data()!;
  if (String(row.object_key ?? "") !== objectKey) {
    return NextResponse.json({ error: "backup_file_id does not match object_key" }, { status: 400 });
  }

  const buf = Buffer.from(await image.arrayBuffer());
  let jpeg: Buffer;
  try {
    jpeg = await sharp(buf)
      .rotate()
      .resize(VIDEO_POSTER_WIDTH, VIDEO_POSTER_HEIGHT, {
        fit: "contain",
        position: "centre",
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    console.error("[video-thumbnail-upload] sharp error", e);
    return NextResponse.json({ error: "Could not process image" }, { status: 400 });
  }

  if (!jpeg.length) {
    return NextResponse.json({ error: "Empty output" }, { status: 400 });
  }

  const cacheKey = getVideoThumbnailCacheKey(objectKey);
  await putObject(cacheKey, jpeg, "image/jpeg");

  const durationSec =
    typeof row.duration_sec === "number" && Number.isFinite(row.duration_sec)
      ? row.duration_sec
      : null;
  let clampedSeek = seekSec;
  if (durationSec != null && durationSec > 0.1) {
    clampedSeek = Math.max(0, Math.min(seekSec, durationSec - 0.05));
  }

  await fileRef.update({
    video_thumbnail_seek_sec: clampedSeek,
    video_thumbnail_rev: FieldValue.increment(1),
  });

  return NextResponse.json({ ok: true, videoThumbnailRev: true });
}
