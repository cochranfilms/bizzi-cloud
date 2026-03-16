/**
 * Core proxy generation logic - runs FFmpeg to create 720p H.264 proxy from source.
 * Used by both the generate-proxy API (sync) and the proxy cron worker (async).
 */
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
import ffmpegPath from "ffmpeg-static";

export interface RunProxyGenerationOptions {
  objectKey: string;
  /** File name for extension check (e.g. clip.mov) */
  fileName?: string | null;
  /** When provided, allows extension-less files if backup_files.media_type is video */
  backupFileId?: string | null;
}

export interface RunProxyGenerationResult {
  ok: boolean;
  alreadyExists?: boolean;
  error?: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

/**
 * Run proxy generation for a video file. Skips if proxy already exists.
 * Caller must verify access before calling.
 */
export async function runProxyGeneration(
  options: RunProxyGenerationOptions
): Promise<RunProxyGenerationResult> {
  const { objectKey, fileName, backupFileId } = options;

  if (!isB2Configured()) {
    return { ok: false, error: "B2 not configured" };
  }

  if (!ffmpegPath) {
    return { ok: false, error: "FFmpeg not available" };
  }

  let allowVideo = isVideoFile((fileName ?? "") || objectKey);
  if (!allowVideo && backupFileId) {
    const { getAdminFirestore } = await import("@/lib/firebase-admin");
    const db = getAdminFirestore();
    const doc = await db.collection("backup_files").doc(backupFileId).get();
    allowVideo = doc.exists && doc.data()?.media_type === "video";
  }
  if (!allowVideo) {
    return { ok: false, error: "Not a video file" };
  }

  const proxyKey = getProxyObjectKey(objectKey);
  if (await objectExists(proxyKey)) {
    return { ok: true, alreadyExists: true };
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

    return { ok: true };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : "Proxy generation failed";
    console.error("[proxy-generation] Error:", msg);
    return { ok: false, error: msg };
  }
}
