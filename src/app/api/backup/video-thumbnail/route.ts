import { spawn } from "child_process";
import {
  isB2Configured,
  createPresignedDownloadUrl,
  objectExists,
  getObjectBuffer,
  putObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
import { isBrawFile } from "@/lib/format-detection";
import { isRawVideoFile } from "@/lib/raw-video";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import {
  VIDEO_POSTER_FFMPEG_TIMEOUT_MS,
  videoPosterFrameFfmpegArgsPipeInput,
} from "@/lib/video-poster-frame";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export const maxDuration = 60;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isDeliveryVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const fileName = url.searchParams.get("name") ?? "";
  const userIdParam = url.searchParams.get("user_id");

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && typeof userIdParam === "string") {
    uid = userIdParam;
  } else if (!token) {
    return new NextResponse("Unauthorized", { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return new NextResponse("Invalid token", { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return new NextResponse("object_key required", { status: 400 });
  }

  if (isAppleDoubleLeafName(fileName) || isAppleDoubleLeafName(objectKey)) {
    return new NextResponse("Not a video file", { status: 400 });
  }

  // Resolve video: delivery extensions, cinema RAW (see raw-video.ts), DB media_type / MIME (extensionless / renamed)
  const leafGuess = fileName || objectKey;
  let isVideo =
    isDeliveryVideoFile(leafGuess) ||
    isRawVideoFile(leafGuess);
  let leafForFfmpeg = fileName || objectKey;
  if (!isVideo) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (!snap.empty) {
      const data = snap.docs[0].data();
      const path = (data.relative_path as string) ?? "";
      const nameFromPath = path.split("/").filter(Boolean).pop() ?? "";
      const contentType = (data.content_type as string) ?? "";
      const mediaType = (data.media_type as string) ?? "";
      leafForFfmpeg = nameFromPath || fileName || objectKey;
      isVideo =
        isDeliveryVideoFile(nameFromPath) ||
        isRawVideoFile(nameFromPath) ||
        contentType.startsWith("video/") ||
        mediaType === "video";
    }
  }
  if (!isVideo) {
    return new NextResponse("Not a video file", { status: 400 });
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    console.warn("[video-thumbnail] Access denied", {
      uid,
      objectKeyPrefix: objectKey.slice(0, 50),
      status: result.status,
    });
    return new NextResponse(result.message ?? "Access denied", {
      status: result.status ?? 403,
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
      console.warn("[video-thumbnail] Cache read failed, regenerating:", cacheErr);
    }

    // Use proxy (720p H.264) when available - more reliable for FFmpeg than original codecs
    const proxyKey = getProxyObjectKey(objectKey);
    const hasProxy = await objectExists(proxyKey);

    /**
     * Vercel / stock ffmpeg-static cannot decode BRAW from source. Without a generated proxy and
     * without FFMPEG_BRAW_PATH, FFmpeg always fails → 503. Serve a neutral placeholder so cards load;
     * client can retry after proxy generation (short cache).
     */
    const brawForkConfigured = Boolean(process.env.FFMPEG_BRAW_PATH?.trim());
    if (
      isBrawFile(leafForFfmpeg) &&
      !hasProxy &&
      !brawForkConfigured
    ) {
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

    /** H.264 proxy decodes with stock ffmpeg; source cinema RAW may need FFMPEG_BRAW_PATH. */
    const ffmpegBin = hasProxy
      ? (ffmpegPath ?? null)
      : resolveFfmpegExecutableForInput(leafForFfmpeg);
    if (!ffmpegBin) {
      console.error("[video-thumbnail] ffmpeg binary not found");
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    const runFfmpeg = async (seekSeconds: number): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
        const stderrChunks: string[] = [];
        const args = videoPosterFrameFfmpegArgsPipeInput(presignedUrl, seekSeconds);

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
        }, VIDEO_POSTER_FFMPEG_TIMEOUT_MS);

        proc.on("close", (code, signal) => {
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
    };

    let posterSeekSec = 0.5;
    try {
      const dbSeek = getAdminFirestore();
      const seekSnap = await dbSeek
        .collection("backup_files")
        .where("object_key", "==", objectKey)
        .limit(10)
        .get();
      for (const d of seekSnap.docs) {
        const t = d.data().video_thumbnail_seek_sec;
        if (typeof t === "number" && Number.isFinite(t) && t >= 0) {
          posterSeekSec = t;
          break;
        }
      }
    } catch (seekErr) {
      console.warn("[video-thumbnail] seek lookup failed, using default:", seekErr);
    }

    let thumbBuffer: Buffer;
    try {
      thumbBuffer = await runFfmpeg(posterSeekSec);
    } catch (firstErr) {
      try {
        thumbBuffer = await runFfmpeg(0);
      } catch (secondErr) {
        const msg =
          firstErr instanceof Error ? firstErr.message : "Video thumbnail failed";
        console.error("[video-thumbnail] FFmpeg failed:", msg);
        return new NextResponse("Video thumbnail not available", { status: 503 });
      }
    }

    if (!thumbBuffer.length) {
      return new NextResponse("Video thumbnail not available", { status: 503 });
    }

    putObject(cacheKey, thumbBuffer, "image/jpeg").catch((e) =>
      console.error("[video-thumbnail] Cache upload failed:", e)
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
    console.error("[video-thumbnail] Error:", msg);
    return new NextResponse("Video thumbnail not available", { status: 503 });
  }
}
