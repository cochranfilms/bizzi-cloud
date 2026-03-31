/**
 * Core proxy generation logic - runs FFmpeg to create 720p H.264 proxy from source.
 * Used by both the generate-proxy API (sync) and the proxy cron worker (async).
 * Validates output before upload; rejects empty or corrupt proxies.
 */
import { spawn } from "child_process";
import { readFile, stat, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  createPresignedDownloadUrl,
  getProxyObjectKey,
  isB2Configured,
  objectExists,
  putObject,
} from "@/lib/b2";
import {
  canGenerateProxy,
  getProxyCapability,
  MIN_PROXY_SIZE_BYTES,
} from "@/lib/format-detection";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
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
  rawUnsupported?: boolean;
  error?: string;
  /** Set when ok: true; used to update backup_files */
  proxySizeBytes?: number;
  proxyDurationSec?: number;
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi|mxf|mts|mkv|3gp|m2ts|mpg|mpeg|ts|flv|wmv|ogv)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

/**
 * Validate proxy file: min size, decodable first frame.
 * Returns { valid: true, durationSec } or { valid: false, error }.
 */
async function validateProxyFile(tmpPath: string): Promise<
  | { valid: true; durationSec?: number }
  | { valid: false; error: string }
> {
  const st = await stat(tmpPath).catch(() => null);
  if (!st || st.size < MIN_PROXY_SIZE_BYTES) {
    return {
      valid: false,
      error: `Proxy file too small (${st?.size ?? 0} bytes, min ${MIN_PROXY_SIZE_BYTES})`,
    };
  }

  if (!ffmpegPath) {
    return { valid: true, durationSec: undefined };
  }

  const duration = await new Promise<number | null>((resolve) => {
    const proc = spawn(ffmpegPath!, [
      "-v",
      "error",
      "-i",
      tmpPath,
      "-t",
      "0.01",
      "-f",
      "null",
      "-",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr?.on("data", (d) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const m = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)/);
      if (m) {
        const h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const sec = parseFloat(m[3]);
        resolve(h * 3600 + min * 60 + sec);
      } else {
        resolve(0); // Unknown duration; validation still passes if decode succeeded
      }
    });
    proc.on("error", () => resolve(null));
    setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 10000);
  });

  if (duration === null) {
    return { valid: false, error: "Proxy file failed decode validation" };
  }

  return { valid: true, durationSec: duration && duration > 0 ? duration : undefined };
}

/**
 * Run proxy generation for a video file. Skips if proxy already exists.
 * Rejects RAW formats (BRAW, R3D, etc.) - does not attempt transcode.
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

  const nameOrPath = (fileName ?? "") || objectKey;
  let mediaType: string | null = null;
  if (backupFileId) {
    const { getAdminFirestore } = await import("@/lib/firebase-admin");
    const db = getAdminFirestore();
    const doc = await db.collection("backup_files").doc(backupFileId).get();
    mediaType = doc.exists ? (doc.data()?.media_type as string) ?? null : null;
  }

  const capability = getProxyCapability(nameOrPath, mediaType);
  if (capability === "raw_unsupported") {
    return { ok: false, rawUnsupported: true, error: "RAW format requires dedicated transcode pipeline" };
  }
  // raw_try: we attempt; on FFmpeg decode failure we return rawUnsupported below
  if (capability === "unsupported") {
    const allowVideo = isVideoFile(nameOrPath) || mediaType === "video";
    if (!allowVideo) {
      return { ok: false, error: "Not a video file" };
    }
  }

  const canProxy = canGenerateProxy(nameOrPath, mediaType);
  if (!canProxy && capability !== "direct") {
    return { ok: false, error: "Format not supported for proxy generation" };
  }

  const proxyKey = getProxyObjectKey(objectKey);
  if (await objectExists(proxyKey)) {
    return { ok: true, alreadyExists: true };
  }

  const tmpPath = join(tmpdir(), `proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  const effectiveFfmpeg = resolveFfmpegExecutableForInput(nameOrPath);
  if (!effectiveFfmpeg) {
    return { ok: false, error: "FFmpeg not available" };
  }

  const isRawTry = capability === "raw_try";

  try {
    const presignedUrl = await createPresignedDownloadUrl(objectKey, 600);
    let ffmpegStderr = "";

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
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-movflags",
        "+faststart",
        tmpPath,
      ];

      const proc = spawn(effectiveFfmpeg, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
      });

      proc.stderr?.on("data", (d: Buffer) => {
        ffmpegStderr += d.toString();
      });

      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(ffmpegStderr || `FFmpeg exited with code ${code}`));
      });
      proc.on("error", reject);
    });

    const validation = await validateProxyFile(tmpPath);
    if (!validation.valid) {
      await unlink(tmpPath).catch(() => {});
      return { ok: false, error: validation.error };
    }

    const buffer = await readFile(tmpPath);
    await unlink(tmpPath).catch(() => {});

    if (buffer.length < MIN_PROXY_SIZE_BYTES) {
      return { ok: false, error: `Proxy buffer too small (${buffer.length} bytes)` };
    }

    await putObject(proxyKey, buffer, "video/mp4");

    return {
      ok: true,
      proxySizeBytes: buffer.length,
      proxyDurationSec: validation.durationSec,
    };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : "Proxy generation failed";
    console.error("[proxy-generation] Error:", msg);
    // RAW formats: on decode failure, mark raw_unsupported to avoid retries
    if (capability === "raw_try") {
      const decodeFailure =
        /invalid data|could not find codec|format not found|no decoder|unknown decoder|not supported|does not support/i.test(msg);
      if (decodeFailure) {
        return { ok: false, rawUnsupported: true, error: msg };
      }
    }
    return { ok: false, error: msg };
  }
}
