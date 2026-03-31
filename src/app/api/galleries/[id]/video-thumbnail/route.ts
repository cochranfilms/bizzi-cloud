/**
 * GET /api/galleries/[id]/video-thumbnail?object_key=...&name=...&password=...
 * Serves video thumbnail for gallery display. Verifies gallery view access.
 */
import { spawn } from "child_process";
import {
  createPresignedDownloadUrl,
  isB2Configured,
  objectExists,
  getObjectBuffer,
  putObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
import { isRawVideoFile } from "@/lib/raw-video";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";

export const maxDuration = 60;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isDeliveryVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const { id: galleryId } = await params;
  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const fileName = url.searchParams.get("name") ?? "";
  const password = url.searchParams.get("password") ?? undefined;

  if (!galleryId || !objectKey) {
    return new NextResponse("gallery id and object_key required", {
      status: 400,
    });
  }

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return new NextResponse("Gallery not found", { status: 404 });

  const g = gallerySnap.data()!;
  const authHeader = request.headers.get("Authorization");
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));
  const access = await verifyGalleryViewAccess(
    {
      photographer_id: g.photographer_id,
      access_mode: g.access_mode ?? "public",
      password_hash: g.password_hash,
      pin_hash: g.pin_hash,
      invited_emails: g.invited_emails ?? [],
      expiration_date: g.expiration_date,
    },
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const assetSnap = await db
    .collection("gallery_assets")
    .where("gallery_id", "==", galleryId)
    .where("object_key", "==", objectKey)
    .where("is_visible", "==", true)
    .limit(1)
    .get();

  if (assetSnap.empty) {
    return new NextResponse("Asset not found", { status: 404 });
  }

  const assetData = assetSnap.docs[0]!.data();
  const backupFileId = assetData.backup_file_id as string | undefined;
  let leafForFfmpeg = fileName || objectKey;
  let isVideo =
    isDeliveryVideoFile(leafForFfmpeg) || isRawVideoFile(leafForFfmpeg);
  if (!isVideo && backupFileId) {
    const bfSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (bfSnap.exists) {
      const d = bfSnap.data()!;
      const path = (d.relative_path as string) ?? "";
      const nameFromPath = path.split("/").filter(Boolean).pop() ?? "";
      const contentType = (d.content_type as string) ?? "";
      const mediaType = (d.media_type as string) ?? "";
      leafForFfmpeg = nameFromPath || fileName || objectKey;
      isVideo =
        isDeliveryVideoFile(nameFromPath) ||
        isRawVideoFile(nameFromPath) ||
        contentType.startsWith("video/") ||
        mediaType === "video";
    }
  }
  if (!isVideo) {
    return new NextResponse("gallery id, object_key and video name required", {
      status: 400,
    });
  }

  try {
    const cacheKey = getVideoThumbnailCacheKey(objectKey);
    try {
      if (await objectExists(cacheKey)) {
        const cached = await getObjectBuffer(cacheKey, 512 * 1024);
        if (cached.length > 0) {
          return new NextResponse(Uint8Array.from(cached), {
            status: 200,
            headers: {
              "Content-Type": "image/jpeg",
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
      }
    } catch {
      // Regenerate
    }

    const proxyKey = getProxyObjectKey(objectKey);
    const hasProxy = await objectExists(proxyKey);
    const effectiveKey = hasProxy ? proxyKey : objectKey;
    const presignedUrl = await createPresignedDownloadUrl(effectiveKey, 600);

    const ffmpegBin = hasProxy
      ? (ffmpegPath ?? null)
      : resolveFfmpegExecutableForInput(leafForFfmpeg);
    if (!ffmpegBin) {
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    const runFfmpeg = async (seekSeconds: number): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const stderrChunks: string[] = [];
        const args = [
          "-y", "-nostdin",
          "-probesize", "32K",
          "-analyzeduration", "500000",
          "-ss", String(seekSeconds),
          "-t", "5",
          "-i", presignedUrl,
          "-vframes", "1",
          "-vf", "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2",
          "-f", "image2", "-q:v", "3", "pipe:1",
        ];
        const proc = spawn(ffmpegBin, args, {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
        });
        const chunks: Buffer[] = [];
        proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
        proc.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk.toString()));
        const timeoutId = setTimeout(() => {
          proc.kill("SIGKILL");
          reject(new Error("FFmpeg timeout"));
        }, 45000);
        proc.on("close", (code) => {
          clearTimeout(timeoutId);
          if (code === 0) resolve(Buffer.concat(chunks));
          else reject(new Error(`FFmpeg exited ${code}: ${stderrChunks.join("").slice(-500)}`));
        });
        proc.on("error", (e) => {
          clearTimeout(timeoutId);
          reject(e);
        });
      });

    let thumbBuffer: Buffer;
    try {
      thumbBuffer = await runFfmpeg(0.5);
    } catch {
      thumbBuffer = await runFfmpeg(0);
    }

    if (!thumbBuffer.length) {
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    putObject(cacheKey, thumbBuffer, "image/jpeg").catch(() => {});

    return new NextResponse(new Uint8Array(thumbBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video thumbnail failed";
    console.error("[gallery video-thumbnail] Error:", msg);
    return new NextResponse("Video thumbnail not available", { status: 503 });
  }
}
