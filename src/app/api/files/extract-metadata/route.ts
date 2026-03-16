/**
 * POST /api/files/extract-metadata
 * Extracts video/photo metadata and updates backup_files.
 * Invoked asynchronously after upload (fire-and-forget).
 * Can be slow for large videos (B2 fetch + ffmpeg probe) — allow up to 5 min.
 */
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  getObjectBuffer,
  getObjectHeadBuffer,
  isB2Configured,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyIdToken } from "@/lib/firebase-admin";

/** Allow up to 5 min for large video/image processing (B2 fetch + ffmpeg/sharp). */
export const maxDuration = 300;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|heic|tiff|tif|cr2|cr3|nef|arw|raf|orf|rw2|dng|raw)$/i;

/** Max bytes to fetch for video probe (metadata usually in first 20MB) */
const VIDEO_PROBE_BYTES = 20 * 1024 * 1024;
/** Max bytes for image metadata (full file for small images) */
const IMAGE_METADATA_BYTES = 50 * 1024 * 1024;

function isVideo(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

function isImage(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

function getExtension(name: string): string {
  return path.extname(name).toLowerCase().slice(1) || "";
}

/** Parse ffmpeg stderr for video metadata */
function parseFfmpegOutput(stderr: string, fileName: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Duration: 00:01:23.45
  const durationMatch = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (durationMatch) {
    const [, h, m, s, cs] = durationMatch.map(Number);
    result.duration_sec = h * 3600 + m * 60 + s + cs / 100;
  }
  // Stream #0:0: Video: h264, yuv420p, 1920x1080, 30 fps ...
  const videoMatch = stderr.match(/Video:\s*\w+,.*?(\d+)x(\d+).*?(\d+(?:\.\d+)?)\s*fps/);
  if (videoMatch) {
    result.resolution_w = parseInt(videoMatch[1], 10);
    result.resolution_h = parseInt(videoMatch[2], 10);
    result.frame_rate = parseFloat(videoMatch[3]);
  }
  // Codec from Video: h264
  const codecMatch = stderr.match(/Video:\s*(\w+)/);
  if (codecMatch) {
    const codec = codecMatch[1].toLowerCase();
    result.video_codec = codec;
  }
  // Audio stream presence
  result.has_audio = /Stream.*Audio:/i.test(stderr);
  // Audio: aac, 48000 Hz, stereo
  const audioMatch = stderr.match(/Audio:.*?(mono|stereo|5\.1|7\.1)/i);
  if (audioMatch) {
    const ch = audioMatch[1].toLowerCase();
    result.audio_channels = ch === "mono" ? 1 : ch === "stereo" ? 2 : ch === "5.1" ? 6 : 8;
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

  const isGenericType =
    !contentType || contentType === "application/octet-stream" || contentType === "binary/octet-stream";
  const shouldProbeForVideo =
    (isVideo(fileName) || (isGenericType && !isImage(fileName))) && !!ffmpegPath;

  const updates: Record<string, unknown> = {
    media_type: isVideo(fileName) ? "video" : isImage(fileName) ? "photo" : "other",
    uploader_id: uid,
  };
  if (!fileData.created_at) {
    updates.created_at = new Date().toISOString();
  }

  try {
    if (shouldProbeForVideo) {
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
          proc.on("close", (code) => {
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
      } finally {
        await fs.unlink(tmpPath).catch(() => {});
      }
    } else if (isImage(fileName)) {
      const buffer = await getObjectBuffer(objectKey, IMAGE_METADATA_BYTES);
      const meta = await sharp(buffer).metadata();
      if (meta.width) updates.width = meta.width;
      if (meta.height) updates.height = meta.height;
      if (meta.width) updates.resolution_w = meta.width;
      if (meta.height) updates.resolution_h = meta.height;
      const w = meta.width ?? 0;
      const h = meta.height ?? 0;
      if (w && h) {
        if (w === h) updates.orientation = "square";
        else if (w > h) updates.orientation = "landscape";
        else updates.orientation = "portrait";
      }
      const rawExt = getExtension(fileName);
      if (["cr2", "cr3", "nef", "arw", "raf", "orf", "rw2", "dng", "raw"].includes(rawExt)) {
        updates.raw_format = rawExt;
      }
      // Exiftool for camera/lens (may fail on Vercel - optional)
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
          if (tags.ColorSpace) updates.color_profile = String(tags.ColorSpace).toLowerCase().replace(/\s/g, "_");
          if (tags.BitDepth) updates.bit_depth = Number(tags.BitDepth);
        } finally {
          await fs.unlink(tmpPath).catch(() => {});
        }
      } catch {
        // Exiftool may not be available; dimensions from Sharp are enough
      }
    }
  } catch (err) {
    console.error("[extract-metadata] Extraction failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Extraction failed" },
      { status: 500 }
    );
  }

  if (Object.keys(updates).length > 2) {
    await fileRef.update(updates);
  }

  // Trigger MUX asset creation and proxy for videos (including extension-less files discovered via probe)
  const isVideoNow = (updates.media_type ?? fileData.media_type) === "video";
  if (isVideoNow && token) {
    const base = new URL(request.url).origin;
    const authHeader = { Authorization: `Bearer ${token}` };
    fetch(`${base}/api/backup/generate-proxy`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        object_key: objectKey,
        name: fileName,
        backup_file_id: backupFileId,
      }),
    }).catch(() => {});
    fetch(`${base}/api/mux/create-asset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader },
      body: JSON.stringify({
        object_key: objectKey,
        name: fileName,
        backup_file_id: backupFileId,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
