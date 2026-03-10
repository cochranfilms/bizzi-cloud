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
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export const maxDuration = 60;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  if (!ffmpegPath) {
    console.error("[video-thumbnail] ffmpeg binary not found");
    return new NextResponse("Video thumbnail not available", { status: 503 });
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

  // Resolve video check: filename, path from DB, or content_type (persists across rename)
  let isVideo = isVideoFile(fileName || objectKey);
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
      isVideo =
        isVideoFile(nameFromPath) ||
        contentType.startsWith("video/");
    }
  }
  if (!isVideo) {
    return new NextResponse("Not a video file", { status: 400 });
  }

  const hasAccess = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  if (!hasAccess) {
    console.warn("[video-thumbnail] 403 Access denied", {
      uid,
      objectKeyPrefix: objectKey.slice(0, 50),
    });
    return new NextResponse("Access denied", { status: 403 });
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
    const effectiveKey = (await objectExists(proxyKey)) ? proxyKey : objectKey;
    const presignedUrl = await createPresignedDownloadUrl(effectiveKey, 600);

    const FFMPEG_TIMEOUT_MS = 45000;

    const runFfmpeg = async (seekSeconds: number): Promise<Buffer> => {
      return new Promise((resolve, reject) => {
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

        const proc = spawn(ffmpegPath!, args, {
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

    let thumbBuffer: Buffer;
    try {
      thumbBuffer = await runFfmpeg(0.5);
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
