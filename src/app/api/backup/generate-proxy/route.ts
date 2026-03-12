import { spawn } from "child_process";
import { readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  createPresignedDownloadUrl,
  getProxyObjectKey,
  isB2Configured,
  objectExists,
  putObject,
} from "@/lib/b2";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export const maxDuration = 300;

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  if (!ffmpegPath) {
    return NextResponse.json(
      { error: "FFmpeg not available for proxy generation" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { object_key: objectKey, name: fileName, user_id: userIdFromBody, backup_file_id: backupFileId } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key required" }, { status: 400 });
  }

  // Allow extension-less videos when backup_file_id has media_type=video (from extract-metadata probe)
  let allowVideo = isVideoFile((typeof fileName === "string" ? fileName : null) || objectKey);
  if (!allowVideo && backupFileId && typeof backupFileId === "string") {
    const { getAdminFirestore } = await import("@/lib/firebase-admin");
    const db = getAdminFirestore();
    const doc = await db.collection("backup_files").doc(backupFileId).get();
    allowVideo = doc.exists && doc.data()?.media_type === "video";
  }
  if (!allowVideo) {
    return NextResponse.json({ error: "Not a video file" }, { status: 400 });
  }

  const hasAccess = await verifyBackupFileAccess(uid, objectKey);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const proxyKey = getProxyObjectKey(objectKey);
  if (await objectExists(proxyKey)) {
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  const tmpPath = join(tmpdir(), `proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);

  try {
    const presignedUrl = await createPresignedDownloadUrl(objectKey, 600);

    await new Promise<void>((resolve, reject) => {
      const args = [
        "-y",
        "-probesize",
        "32K",
        "-analyzeduration",
        "500000",
        "-i",
        presignedUrl,
        "-t",
        "3600",
        "-vf",
        "scale=720:-2",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        tmpPath,
      ];

      const proc = spawn(ffmpegPath!, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
      });

      proc.stderr?.on("data", () => {});

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
      proc.on("error", reject);
    });

    const buffer = await readFile(tmpPath);
    await unlink(tmpPath).catch(() => {});

    await putObject(proxyKey, buffer, "video/mp4");

    return NextResponse.json({ ok: true });
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : "Proxy generation failed";
    console.error("[generate-proxy] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
