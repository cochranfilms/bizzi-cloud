import { spawn } from "child_process";
import { readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createPresignedDownloadUrl,
  getLutBakedObjectKey,
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

/** Suggest output filename with Rec709 suffix. */
function getBakedDownloadName(originalName: string): string {
  const lastDot = originalName.lastIndexOf(".");
  if (lastDot <= 0) return `${originalName}_Rec709.mp4`;
  const base = originalName.slice(0, lastDot);
  const ext = originalName.slice(lastDot).toLowerCase();
  if (ext === ".mp4" || ext === ".mov" || ext === ".m4v") {
    return `${base}_Rec709${ext}`;
  }
  return `${base}_Rec709.mp4`;
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
      { error: "FFmpeg not available for LUT baking" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { object_key: objectKey, name: fileName, user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const nameToCheck = (typeof fileName === "string" ? fileName : null) || objectKey;
  if (!isVideoFile(nameToCheck)) {
    return NextResponse.json({ error: "Not a video file" }, { status: 400 });
  }

  const hasAccess = await verifyBackupFileAccess(uid, objectKey);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const lutBakedKey = getLutBakedObjectKey(objectKey);

  if (await objectExists(lutBakedKey)) {
    const downloadName = getBakedDownloadName(nameToCheck);
    const url = await createPresignedDownloadUrl(lutBakedKey, 3600, downloadName);
    return NextResponse.json({ url, downloadName });
  }

  const lutPath = join(process.cwd(), "public", "CINECOLOR_S-LOG3.cube");
  if (!existsSync(lutPath)) {
    console.error("[download-with-lut] LUT file not found:", lutPath);
    return NextResponse.json(
      { error: "LUT file not available" },
      { status: 503 }
    );
  }

  const tmpPath = join(
    tmpdir(),
    `lut-bake-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`
  );

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
        "-vf",
        `lut3d=file=${lutPath}`,
        "-c:a",
        "copy",
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

    await putObject(lutBakedKey, buffer, "video/mp4");

    const downloadName = getBakedDownloadName(nameToCheck);
    const url = await createPresignedDownloadUrl(lutBakedKey, 3600, downloadName);
    return NextResponse.json({ url, downloadName });
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : "LUT baking failed";
    console.error("[download-with-lut] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
