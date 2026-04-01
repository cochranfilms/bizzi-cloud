/**
 * Core proxy generation logic - runs FFmpeg to create 720p H.264 proxy from source.
 * Used for optional dev-only sync generate-proxy; production uses the dedicated standard-proxy worker.
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
  isBrawFile,
  MIN_PROXY_SIZE_BYTES,
} from "@/lib/format-detection";
import { resolveFfmpegExecutableForInput } from "@/lib/ffmpeg-binary";
import { formatRawDecoderUnavailableMessage } from "@/lib/braw-media-worker";
import type { ProxySourceInputErrorCode } from "@/lib/proxy-input-errors";
import ffmpegPath from "ffmpeg-static";

/**
 * libx264 preset for 720p proxies. Default `veryfast` is tuned for serverless time limits
 * (e.g. Vercel max 300s). Set PROXY_FFMPEG_PRESET=faster|fast|medium|slow for quality vs speed.
 */
const PROXY_FFMPEG_PRESET = process.env.PROXY_FFMPEG_PRESET?.trim() || "veryfast";

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
  /**
   * Canonical B2 source key used (from backup_files.object_key when backupFileId is set).
   * Callers must use this for getProxyObjectKey(), not the queued job’s object_key, which may be stale.
   */
  resolvedSourceObjectKey?: string;
  /** Terminal input / storage failure — do not retry as generic transcode; not raw_unsupported. */
  proxyErrorCode?: ProxySourceInputErrorCode;
  /** .braw is only transcoded on the dedicated Linux media worker, not this path. */
  brawRequiresDedicatedWorker?: boolean;
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

function presignedUrlForLog(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return { host: u.host, path: u.pathname };
  } catch {
    return { host: "", path: "" };
  }
}

const MAX_PROXY_ERROR_REASON_LEN = 1800;

function clampProxyErrorReason(s: string): string {
  if (s.length <= MAX_PROXY_ERROR_REASON_LEN) return s;
  return `${s.slice(0, MAX_PROXY_ERROR_REASON_LEN - 1)}…`;
}

/**
 * User-facing reason for raw_try decode failure. Stock FFmpeg demuxes BRAW (brxq) but has no decoder —
 * do not dump multi-kB stderr into Firestore or the preview modal.
 */
export function summarizeRawDecodeFailureForUser(
  ffmpegStderr: string,
  leafForExt: string,
  usedBrawCapableBinary: boolean
): string {
  const s = ffmpegStderr;
  const looksBraw =
    isBrawFile(leafForExt) ||
    /\(brxq\s*\/|brxq\b|braw_codec|blackmagic design film/i.test(s);
  if (looksBraw && !usedBrawCapableBinary) {
    return "Blackmagic RAW (brxq) needs the dedicated Linux media worker (POST /api/workers/braw-proxy/claim) with Blackmagic RAW SDK / BRAW-capable FFmpeg — not stock serverless transcoding. Or use Download.";
  }
  if (looksBraw && usedBrawCapableBinary) {
    return "Blackmagic RAW decode failed with the configured BRAW FFmpeg. Check worker logs or use Download.";
  }
  const codecLine = s
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /could not find codec|no decoder found|unknown codec/i.test(l));
  if (codecLine && codecLine.length <= 520) return codecLine;
  return "This camera RAW format could not be decoded for a cloud proxy. Use Download or an external transcode pipeline.";
}

/**
 * Run proxy generation for a video file. Skips if proxy already exists.
 * Resolves source object_key from backup_files when backupFileId is set (queued job key may be stale).
 * Caller must verify access before calling.
 */
export async function runProxyGeneration(
  options: RunProxyGenerationOptions
): Promise<RunProxyGenerationResult> {
  const { objectKey, fileName, backupFileId } = options;

  if (!isB2Configured()) {
    return { ok: false, error: "B2 not configured", resolvedSourceObjectKey: objectKey };
  }

  if (!ffmpegPath) {
    return { ok: false, error: "FFmpeg not available", resolvedSourceObjectKey: objectKey };
  }

  let mediaType: string | null = null;
  let sourceObjectKey = objectKey;
  let objectKeyStaleVersusJob = false;

  if (backupFileId) {
    const { getAdminFirestore } = await import("@/lib/firebase-admin");
    const db = getAdminFirestore();
    const doc = await db.collection("backup_files").doc(backupFileId).get();
    if (doc.exists) {
      const d = doc.data()!;
      mediaType = (d.media_type as string) ?? null;
      const dbKey = (d.object_key as string) ?? "";
      if (typeof dbKey === "string" && dbKey.trim()) {
        if (dbKey !== objectKey) objectKeyStaleVersusJob = true;
        sourceObjectKey = dbKey;
      }
    }
  }

  console.info(
    JSON.stringify({
      scope: "proxy_generation",
      event: "source_key_resolved",
      backup_file_id: backupFileId ?? null,
      object_key_from_job: objectKey,
      object_key_resolved: sourceObjectKey,
      object_key_stale_versus_job: objectKeyStaleVersusJob,
    })
  );

  const nameOrPath = (fileName ?? "") || sourceObjectKey;
  const capability = getProxyCapability(nameOrPath, mediaType);
  if (capability === "raw_unsupported") {
    return {
      ok: false,
      rawUnsupported: true,
      error: "RAW format requires dedicated transcode pipeline",
      resolvedSourceObjectKey: sourceObjectKey,
    };
  }
  if (capability === "unsupported") {
    const allowVideo = isVideoFile(nameOrPath) || mediaType === "video";
    if (!allowVideo) {
      return { ok: false, error: "Not a video file", resolvedSourceObjectKey: sourceObjectKey };
    }
  }

  const canProxy = canGenerateProxy(nameOrPath, mediaType);
  if (!canProxy && capability !== "direct") {
    return {
      ok: false,
      error: "Format not supported for proxy generation",
      resolvedSourceObjectKey: sourceObjectKey,
    };
  }

  const proxyKey = getProxyObjectKey(sourceObjectKey);
  if (await objectExists(proxyKey)) {
    return { ok: true, alreadyExists: true, resolvedSourceObjectKey: sourceObjectKey };
  }

  /** Blackmagic RAW: brxq decode runs only on the dedicated worker (`/api/workers/braw-proxy/*`). */
  if (isBrawFile(nameOrPath)) {
    return {
      ok: false,
      brawRequiresDedicatedWorker: true,
      error: formatRawDecoderUnavailableMessage(
        "Use the dedicated BRAW media worker (POST /api/workers/braw-proxy/claim). In-app serverless proxy does not decode brxq."
      ),
      resolvedSourceObjectKey: sourceObjectKey,
    };
  }

  const tmpPath = join(tmpdir(), `proxy-${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`);
  const effectiveFfmpeg = resolveFfmpegExecutableForInput(nameOrPath);
  if (!effectiveFfmpeg) {
    return { ok: false, error: "FFmpeg not available", resolvedSourceObjectKey: sourceObjectKey };
  }

  /** True when .braw and FFMPEG_BRAW_PATH selected a different binary than ffmpeg-static. */
  const usedBrawCapableBinary =
    isBrawFile(nameOrPath) && Boolean(ffmpegPath && effectiveFfmpeg !== ffmpegPath);

  const isRawTry = capability === "raw_try";

  try {
    const sourceExists = await objectExists(sourceObjectKey);

    if (!sourceExists) {
      console.info(
        JSON.stringify({
          scope: "proxy_generation",
          event: "source_b2_head",
          backup_file_id: backupFileId ?? null,
          object_key_resolved: sourceObjectKey,
          existence_check_passed: false,
          presigned_host: "",
          presigned_path_prefix: "",
        })
      );
      return {
        ok: false,
        proxyErrorCode: "source_object_missing",
        error:
          "source_object_missing: no object at resolved backup_files.object_key in B2 (wrong key, not finalized, or deleted)",
        resolvedSourceObjectKey: sourceObjectKey,
      };
    }

    const presignedUrl = await createPresignedDownloadUrl(sourceObjectKey, 600);
    const { host: presignedHost, path: presignedPath } = presignedUrlForLog(presignedUrl);
    console.info(
      JSON.stringify({
        scope: "proxy_generation",
        event: "source_b2_head",
        backup_file_id: backupFileId ?? null,
        object_key_resolved: sourceObjectKey,
        existence_check_passed: true,
        presigned_host: presignedHost,
        presigned_path_prefix: presignedPath.slice(0, 160),
      })
    );
    let ffmpegStderr = "";

    await new Promise<void>((resolve, reject) => {
      /** Remote RAW needs a larger probe than defaults or FFmpeg may not see the stream. */
      const probePrefix = isRawTry
        ? (["-probesize", "100M", "-analyzeduration", "100M"] as const)
        : (["-probesize", "32K", "-analyzeduration", "500000"] as const);
      const args = [
        "-y",
        ...probePrefix,
        "-i",
        presignedUrl,
        "-t",
        "3600",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
        "-c:v",
        "libx264",
        "-preset",
        PROXY_FFMPEG_PRESET,
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
      return { ok: false, error: validation.error, resolvedSourceObjectKey: sourceObjectKey };
    }

    const buffer = await readFile(tmpPath);
    await unlink(tmpPath).catch(() => {});

    if (buffer.length < MIN_PROXY_SIZE_BYTES) {
      return {
        ok: false,
        error: `Proxy buffer too small (${buffer.length} bytes)`,
        resolvedSourceObjectKey: sourceObjectKey,
      };
    }

    await putObject(proxyKey, buffer, "video/mp4");

    return {
      ok: true,
      proxySizeBytes: buffer.length,
      proxyDurationSec: validation.durationSec,
      resolvedSourceObjectKey: sourceObjectKey,
    };
  } catch (err) {
    await unlink(tmpPath).catch(() => {});
    const msg = err instanceof Error ? err.message : "Proxy generation failed";

    const http404 = /HTTP error 404|404 Not Found|Server returned 404/i.test(msg);
    if (http404) {
      console.error(
        JSON.stringify({
          scope: "proxy_generation",
          event: "ffmpeg_input_http_404",
          backup_file_id: backupFileId ?? null,
          object_key_resolved: sourceObjectKey,
          existence_head_was_true: true,
        })
      );
      return {
        ok: false,
        proxyErrorCode: "source_url_404",
        error: "source_url_404: storage returned 404 when FFmpeg opened the signed input URL",
        resolvedSourceObjectKey: sourceObjectKey,
      };
    }

    console.error("[proxy-generation] Error:", msg.slice(0, 500));
    if (capability === "raw_try") {
      const decodeFailure =
        /invalid data|could not find codec|format not found|no decoder|unknown decoder|not supported|does not support|simple filtergraph/i.test(
          msg
        );
      if (decodeFailure) {
        const userMsg = clampProxyErrorReason(
          summarizeRawDecodeFailureForUser(msg, nameOrPath, usedBrawCapableBinary)
        );
        console.error(
          JSON.stringify({
            scope: "proxy_generation",
            event: "raw_proxy_decode_failed",
            backup_file_id: backupFileId ?? null,
            object_key_resolved: sourceObjectKey,
            used_braw_ffmpeg: usedBrawCapableBinary,
            user_message: userMsg,
            stderr_tail: msg.slice(-3500),
          })
        );
        return {
          ok: false,
          rawUnsupported: true,
          error: userMsg,
          resolvedSourceObjectKey: sourceObjectKey,
        };
      }
    }
    return { ok: false, error: msg, resolvedSourceObjectKey: sourceObjectKey };
  }
}
