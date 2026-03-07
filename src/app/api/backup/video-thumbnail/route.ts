import { spawn } from "child_process";
import { isB2Configured } from "@/lib/b2";
import { createPresignedDownloadUrl } from "@/lib/b2";
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

async function verifyObjectAccess(uid: string, objectKey: string): Promise<boolean> {
  if (objectKey.startsWith("content/")) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (snap.empty) return false;
    return !snap.docs[0].data().deleted_at;
  }
  const prefix = `backups/${uid}/`;
  return objectKey.startsWith(prefix);
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

  if (!isVideoFile(fileName || objectKey)) {
    return new NextResponse("Not a video file", { status: 400 });
  }

  const hasAccess = await verifyObjectAccess(uid, objectKey);
  if (!hasAccess) {
    return new NextResponse("Access denied", { status: 403 });
  }

  try {
    const presignedUrl = await createPresignedDownloadUrl(objectKey, 600);

    const thumbBuffer = await new Promise<Buffer>((resolve, reject) => {
      const args = [
        "-y",
        "-ss",
        "0.5",
        "-i",
        presignedUrl,
        "-vframes",
        "1",
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
      proc.stderr?.on("data", () => {});

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      proc.on("error", reject);
    });

    if (!thumbBuffer.length) {
      return new NextResponse("Failed to generate thumbnail", { status: 500 });
    }

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
    return new NextResponse(msg, { status: 500 });
  }
}
