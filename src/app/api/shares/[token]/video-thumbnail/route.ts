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
import { shareFirestoreDataToAccessDoc, verifyShareAccess } from "@/lib/share-access";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
import { isBrawFile } from "@/lib/format-detection";
import { isRawVideoFile } from "@/lib/raw-video";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";

export const maxDuration = 60;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isDeliveryVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
    return new NextResponse("Invalid token", { status: 400 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const fileName = url.searchParams.get("name") ?? "";

  if (!objectKey) {
    return new NextResponse("object_key required", {
      status: 400,
    });
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(shareToken).get();

  if (!shareSnap.exists) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return new NextResponse("Share expired", { status: 410 });
  }

  const authHeader = request.headers.get("Authorization");
  const access = await verifyShareAccess(shareFirestoreDataToAccessDoc(share as Record<string, unknown>), authHeader);

  if (!access.allowed) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const ownerId = share.owner_id as string;
  const referencedFileIds = share.referenced_file_ids as string[] | undefined;
  const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

  let fileSnap;
  if (isVirtualShare) {
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (!fileSnap.empty && !referencedFileIds.includes(fileSnap.docs[0].id)) {
      return new NextResponse("Access denied", { status: 403 });
    }
  } else {
    const linkedDriveId = share.linked_drive_id as string;
    fileSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
  }

  if (fileSnap.empty || fileSnap.docs[0].data().deleted_at) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const fileRow = fileSnap.docs[0].data();
  const rel = (fileRow.relative_path as string) ?? "";
  const nameFromPath = rel.split("/").filter(Boolean).pop() ?? "";
  const leafForFfmpeg = nameFromPath || fileName || objectKey;
  const contentType = (fileRow.content_type as string) ?? "";
  const mediaType = (fileRow.media_type as string) ?? "";
  const isVideo =
    isDeliveryVideoFile(leafForFfmpeg) ||
    isRawVideoFile(leafForFfmpeg) ||
    contentType.startsWith("video/") ||
    mediaType === "video";
  if (!isVideo) {
    return new NextResponse("object_key and video name required", {
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
    } catch (cacheErr) {
      console.warn("[share video-thumbnail] Cache read failed, regenerating:", cacheErr);
    }

    // Use proxy when available for more reliable FFmpeg processing
    const proxyKey = getProxyObjectKey(objectKey);
    const hasProxy = await objectExists(proxyKey);

    const brawForkConfigured = Boolean(process.env.FFMPEG_BRAW_PATH?.trim());
    if (isBrawFile(leafForFfmpeg) && !hasProxy && !brawForkConfigured) {
      const placeholder = await sharp({
        create: {
          width: 480,
          height: 270,
          channels: 3,
          background: { r: 64, g: 64, b: 64 },
        },
      })
        .jpeg({ quality: 80 })
        .toBuffer();
      return new NextResponse(new Uint8Array(placeholder), {
        status: 200,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=30, must-revalidate",
          "X-Bizzi-Video-Thumbnail": "braw_proxy_pending",
        },
      });
    }

    const effectiveKey = hasProxy ? proxyKey : objectKey;
    const presignedUrl = await createPresignedDownloadUrl(effectiveKey, 600);

    const ffmpegBin = hasProxy
      ? (ffmpegPath ?? null)
      : resolveFfmpegExecutableForInput(leafForFfmpeg);
    if (!ffmpegBin) {
      console.error("[share video-thumbnail] ffmpeg binary not found");
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    const FFMPEG_TIMEOUT_MS = 45000;

    const runFfmpeg = async (seekSeconds: number): Promise<Buffer> =>
      new Promise((resolve, reject) => {
        const stderrChunks: string[] = [];
        const args = [
          "-y",
          "-nostdin",
          "-probesize",
          "32K",
          "-analyzeduration",
          "500000",
          "-ss",
          String(seekSeconds),
          "-t",
          "5",
          "-i",
          presignedUrl,
          "-vframes",
          "1",
          "-vf",
          "scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2",
          "-f",
          "image2",
          "-q:v",
          "3",
          "pipe:1",
        ];

        const proc = spawn(ffmpegBin, args, {
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
        });

        const chunks: Buffer[] = [];
        proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
        proc.stderr?.on("data", (chunk: Buffer) =>
          stderrChunks.push(chunk.toString())
        );

        const timeoutId = setTimeout(() => {
          proc.kill("SIGKILL");
          reject(new Error("FFmpeg timeout"));
        }, FFMPEG_TIMEOUT_MS);

        proc.on("close", (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve(Buffer.concat(chunks));
          } else {
            const stderr = stderrChunks.join("").slice(-500);
            reject(new Error(`FFmpeg exited ${code}: ${stderr || "no stderr"}`));
          }
        });
        proc.on("error", (e) => {
          clearTimeout(timeoutId);
          reject(new Error(`FFmpeg spawn failed: ${e.message}`));
        });
      });

    let thumbBuffer: Buffer;
    try {
      thumbBuffer = await runFfmpeg(0.5);
    } catch (firstErr) {
      try {
        thumbBuffer = await runFfmpeg(0);
      } catch (secondErr) {
        const msg =
          firstErr instanceof Error ? firstErr.message : "Video thumbnail failed";
        console.error("[share video-thumbnail] FFmpeg failed:", msg);
        return new NextResponse("Video thumbnail not available", { status: 503 });
      }
    }

    if (!thumbBuffer.length) {
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    putObject(cacheKey, thumbBuffer, "image/jpeg").catch((e) =>
      console.error("[share video-thumbnail] Cache upload failed:", e)
    );

    return new NextResponse(new Uint8Array(thumbBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video thumbnail failed";
    console.error("[share video-thumbnail] Error:", msg);
    return new NextResponse("Video thumbnail not available", { status: 503 });
  }
}
