/**
 * POST /api/files/extract-metadata
 * Extracts video/photo metadata and updates backup_files.
 * Large videos: enqueue metadata_extraction_jobs (Ubuntu worker ffprobe); returns fast.
 * Small videos: bounded B2 head + ffmpeg on Vercel (legacy path).
 */
import { spawn } from "child_process";
import { existsSync } from "fs";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  getObjectBuffer,
  getObjectHeadBuffer,
  getObjectMetadata,
  isB2Configured,
} from "@/lib/b2";
import { runVideoIngestFollowup } from "@/lib/backup-file-video-ingest-followup";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";
import { enqueueMetadataExtractionJob } from "@/lib/metadata-extraction-job-pipeline";
import {
  isDocumentFile,
  isVideoFile,
  isImageFile,
  isArchiveFile,
} from "@/lib/bizzi-file-types";
import {
  classifyCreativeFileFromRelativePath,
  shouldSkipVideoProbeForCreativePath,
} from "@/lib/creative-file-registry";

/** Allow up to 5 min for small-video probe + image processing on Vercel. */
export const maxDuration = 300;

/** Max bytes to fetch for video probe (metadata usually in first 20MB) */
const VIDEO_PROBE_BYTES = 20 * 1024 * 1024;
/** Max bytes for image metadata (full file for small images) */
const IMAGE_METADATA_BYTES = 50 * 1024 * 1024;

function metadataOffloadMinBytes(): number {
  const raw = process.env.METADATA_EXTRACTION_OFFLOAD_MIN_BYTES?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 50 * 1024 * 1024;
}

function getExtension(name: string): string {
  return path.extname(name).toLowerCase().slice(1) || "";
}

/** Parse ffmpeg stderr for video metadata */
function parseFfmpegOutput(stderr: string, fileName: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (durationMatch) {
    const [, h, m, s, cs] = durationMatch.map(Number);
    result.duration_sec = h * 3600 + m * 60 + s + cs / 100;
  }
  const videoMatch = stderr.match(/Video:\s*\w+,.*?(\d+)x(\d+).*?(\d+(?:\.\d+)?)\s*fps/);
  if (videoMatch) {
    result.resolution_w = parseInt(videoMatch[1], 10);
    result.resolution_h = parseInt(videoMatch[2], 10);
    result.frame_rate = parseFloat(videoMatch[3]);
  }
  const codecMatch = stderr.match(/Video:\s*(\w+)/);
  if (codecMatch) {
    result.video_codec = codecMatch[1].toLowerCase();
  }
  result.has_audio = /Stream.*Audio:/i.test(stderr);
  const audioMatch = stderr.match(/Audio:.*?(mono|stereo|5\.1|7\.1)/i);
  if (audioMatch) {
    const ch = audioMatch[1].toLowerCase();
    result.audio_channels = ch === "mono" ? 1 : ch === "stereo" ? 2 : ch === "5.1" ? 6 : 8;
  }
  const creationTimeMatch = stderr.match(
    /creation_time\s*:\s*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z?)?)/i
  );
  if (creationTimeMatch) {
    const rawT = creationTimeMatch[1].trim().replace(/\s+/, "T");
    const parsed = Date.parse(rawT);
    if (!Number.isNaN(parsed)) result.creation_time = new Date(parsed).toISOString();
  }
  result.container_format = getExtension(fileName) || "mp4";
  return result;
}

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json({ error: "B2 not configured" }, { status: 503 });
  }

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { backup_file_id: string; object_key?: string };
  try {
    body = (await request.json()) as { backup_file_id: string; object_key?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { backup_file_id: backupFileId, object_key: objectKeyParam } = body;
  if (!backupFileId) {
    return NextResponse.json({ error: "backup_file_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const fileData = fileSnap.data()!;
  if (fileData.userId !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const objectKey = (objectKeyParam ?? fileData.object_key) as string;
  const relativePath = (fileData.relative_path ?? "") as string;
  const fileName = relativePath.split("/").filter(Boolean).pop() ?? objectKey;
  const contentType = (fileData.content_type ?? "") as string;
  const linkedDriveId = (fileData.linked_drive_id as string) ?? "";
  let driveIsCreatorRaw = false;
  if (linkedDriveId) {
    const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
    driveIsCreatorRaw = driveSnap.exists && driveSnap.data()?.is_creator_raw === true;
  }

  const isGenericType =
    !contentType || contentType === "application/octet-stream" || contentType === "binary/octet-stream";
  const isDocument = isDocumentFile(fileName);
  const creative = classifyCreativeFileFromRelativePath(relativePath);
  const isArchive = isArchiveFile(fileName);
  const skipProbeCreative = shouldSkipVideoProbeForCreativePath(relativePath);
  const ffmpegOnDisk =
    typeof ffmpegPath === "string" && ffmpegPath.length > 0 && existsSync(ffmpegPath);

  const wantsVideoProbe =
    !isDocument &&
    !skipProbeCreative &&
    !isArchive &&
    (isVideoFile(fileName) || (isGenericType && !isImageFile(fileName)));

  let sizeBytes: number | null =
    typeof fileData.size_bytes === "number" && Number.isFinite(fileData.size_bytes)
      ? fileData.size_bytes
      : null;
  if (wantsVideoProbe && sizeBytes == null) {
    const meta = await getObjectMetadata(objectKey).catch(() => null);
    if (meta?.contentLength != null) sizeBytes = meta.contentLength;
  }

  const deferToWorker =
    wantsVideoProbe && (sizeBytes == null || sizeBytes >= metadataOffloadMinBytes());
  const shouldProbeForVideoSync = wantsVideoProbe && ffmpegOnDisk && !deferToWorker;

  if (isVideoFile(fileName) && wantsVideoProbe && !deferToWorker && !ffmpegOnDisk) {
    let reason: string;
    if (!ffmpegPath) reason = "ffmpeg_static_unresolved";
    else if (!ffmpegOnDisk)
      reason = "ffmpeg_binary_missing_from_serverless_bundle_fix_next_outputFileTracingIncludes";
    else if (isDocument) reason = "document_extension";
    else if (isArchive) reason = "archive";
    else if (skipProbeCreative) reason = "creative_path_probe_skipped";
    else reason = "unknown";
    console.warn("[extract-metadata] Video probe skipped — Resolution/Duration/Codec will stay empty", {
      backupFileId,
      fileName,
      reason,
    });
  }

  const updates: Record<string, unknown> = {
    media_type: isVideoFile(fileName) ? "video" : isImageFile(fileName) ? "photo" : "other",
    uploader_id: uid,
  };

  if (creative.handling_model !== "normal_media_asset") {
    updates.handling_model = creative.handling_model;
    updates.creative_app = creative.creative_app;
    updates.creative_display_label = creative.creative_display_label;
    if (creative.project_file_type) updates.project_file_type = creative.project_file_type;
    if (creative.handling_model === "archive_container") {
      updates.asset_type = "archive";
      updates.preview_supported = false;
    } else {
      updates.asset_type = "project_file";
      updates.preview_supported = false;
    }
  } else if (isArchive) {
    updates.asset_type = "archive";
    updates.preview_supported = false;
  }

  if (deferToWorker) {
    if (!updates.created_at && !fileData.created_at) {
      updates.created_at = new Date().toISOString();
    }
    if (Object.keys(updates).length >= 2) {
      await fileRef.update(updates);
    }
    await enqueueMetadataExtractionJob({
      backup_file_id: backupFileId,
      object_key: objectKey,
      user_id: uid,
      relative_path: relativePath,
    });
    return NextResponse.json({ ok: true, deferred: true });
  }

  try {
    if (shouldProbeForVideoSync) {
      const tmpDir = os.tmpdir();
      const ext = path.extname(fileName) || ".mp4";
      const tmpPath = path.join(tmpDir, `meta-${Date.now()}${ext}`);
      try {
        const buffer = await getObjectHeadBuffer(objectKey, VIDEO_PROBE_BYTES);
        await fs.writeFile(tmpPath, buffer);
        const probeResult = await new Promise<string>((resolve, reject) => {
          const proc = spawn(ffmpegPath!, ["-i", tmpPath, "-f", "null", "-"], {
            stdio: ["ignore", "pipe", "pipe"],
          });
          let stderr = "";
          proc.stderr?.on("data", (d: Buffer) => {
            stderr += d.toString();
          });
          proc.on("close", () => {
            resolve(stderr);
          });
          proc.on("error", reject);
        });
        const meta = parseFfmpegOutput(probeResult, fileName);
        const hasVideoStream = /Stream.*Video:/i.test(probeResult);
        if (hasVideoStream) {
          updates.media_type = "video";
          const container = (meta.container_format as string) || ext || "mp4";
          updates.content_type =
            ["mov", "m4v"].includes(container) ? "video/quicktime" : "video/mp4";
        }
        if (meta.resolution_w) updates.resolution_w = meta.resolution_w;
        if (meta.resolution_h) updates.resolution_h = meta.resolution_h;
        if (meta.frame_rate != null) updates.frame_rate = meta.frame_rate;
        if (meta.duration_sec != null) updates.duration_sec = meta.duration_sec;
        if (meta.video_codec) updates.video_codec = meta.video_codec;
        if (meta.container_format) updates.container_format = meta.container_format;
        if (meta.has_audio != null) updates.has_audio = meta.has_audio;
        if (meta.audio_channels != null) updates.audio_channels = meta.audio_channels;
        if (meta.creation_time && typeof meta.creation_time === "string") {
          updates.created_at = meta.creation_time;
        }
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    } else if (isImageFile(fileName)) {
      try {
        const buffer = await getObjectBuffer(objectKey, IMAGE_METADATA_BYTES);
        const meta = await sharp(buffer).metadata();
        if (meta.width) updates.width = meta.width;
        if (meta.height) updates.height = meta.height;
        if (meta.width) updates.resolution_w = meta.width;
        if (meta.height) updates.resolution_h = meta.height;
        const w0 = meta.width ?? 0;
        const h0 = meta.height ?? 0;
        const exifO = meta.orientation ?? 1;
        updates.exif_orientation = exifO;
        let dw = w0;
        let dh = h0;
        if (exifO >= 5 && exifO <= 8 && w0 > 0 && h0 > 0) {
          dw = h0;
          dh = w0;
        }
        if (dw && dh) {
          if (dw === dh) updates.orientation = "square";
          else if (dw > dh) updates.orientation = "landscape";
          else updates.orientation = "portrait";
        }
        const rawExt = getExtension(fileName);
        if (["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "raw"].includes(rawExt)) {
          updates.raw_format = rawExt;
        }
        try {
          const { exiftool } = await import("exiftool-vendored");
          const tmpPath = path.join(os.tmpdir(), `img-${Date.now()}-${fileName}`);
          await fs.writeFile(tmpPath, buffer);
          try {
            const tags = await exiftool.read(tmpPath);
            if (tags.Make || tags.Model) {
              updates.camera_model = [tags.Make, tags.Model].filter(Boolean).join(" ").trim() || null;
            }
            if (tags.LensModel) updates.lens_info = String(tags.LensModel);
            if (tags.ColorSpace)
              updates.color_profile = String(tags.ColorSpace).toLowerCase().replace(/\s/g, "_");
            if (tags.BitDepth) updates.bit_depth = Number(tags.BitDepth);
          } finally {
            await fs.unlink(tmpPath).catch(() => {});
          }
        } catch {
          /* exiftool optional */
        }
      } catch {
        /* Sharp may fail */
      }
    }
  } catch (err) {
    console.error("[extract-metadata] Extraction failed:", err);
  }

  if (!updates.created_at && !fileData.created_at) {
    updates.created_at = new Date().toISOString();
  }
  if (Object.keys(updates).length >= 2) {
    await fileRef.update(updates);
  }

  const isVideoNow = (updates.media_type ?? fileData.media_type) === "video";
  if (isVideoNow) {
    await runVideoIngestFollowup({
      objectKey,
      fileName,
      backupFileId,
      userId: uid,
      driveIsCreatorRaw,
    });
  }

  return NextResponse.json({ ok: true });
}
