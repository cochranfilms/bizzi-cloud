/**
 * Shared proxy output validation: existence, size, ffprobe streams/codec/duration,
 * optional first-frame decode — used by enqueue fast-path, claim skip, and complete.
 */
import { spawn } from "child_process";
import ffprobe from "ffprobe-static";
import {
  createPresignedDownloadUrl,
  getObjectMetadata,
} from "@/lib/b2";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";
import { STANDARD_PROXY_TRANSCODE_PROFILE } from "@/lib/proxy-job-config";
import ffmpegPath from "ffmpeg-static";

const PROBE_PRESIGN_TTL_SEC = 600;

/** H.264 / AVC markers in ffprobe codec_name or codec_tag_string */
function isH264Codec(streamCodec: string, codecTag?: string): boolean {
  const c = streamCodec.toLowerCase();
  if (c === "h264" || c === "avc" || c === "avc1") return true;
  if (codecTag && /avc|h264/i.test(codecTag)) return true;
  return false;
}

/** Mov/mp4-family format from ffprobe format_name */
function isMp4FamilyContainer(formatName: string): boolean {
  const fn = formatName.toLowerCase();
  return (
    fn.includes("mov") ||
    fn.includes("mp4") ||
    fn.includes("isom") ||
    fn.includes("iso2")
  );
}

export interface ProxyPlayabilityOk {
  ok: true;
  durationSec: number;
  sizeBytes: number;
  transcodeProfile: string;
}

export interface ProxyPlayabilityFail {
  ok: false;
  error: string;
}

async function ffprobeJson(url: string): Promise<Record<string, unknown>> {
  const bin = ffprobe.path;
  return new Promise((resolve, reject) => {
    const proc = spawn(
      bin,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "-i",
        url,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    let out = "";
    let err = "";
    proc.stdout?.on("data", (d: Buffer) => {
      out += d.toString();
    });
    proc.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0 || !out.trim()) {
        reject(new Error(err.trim() || `ffprobe exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(out) as Record<string, unknown>);
      } catch (e) {
        reject(e);
      }
    });
    setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("ffprobe timeout"));
    }, 120_000);
  });
}

async function decodeFirstFrameSmokeTest(url: string): Promise<boolean> {
  const bin = ffmpegPath;
  if (!bin) return true;
  return new Promise((resolve) => {
    const proc = spawn(
      bin,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        url,
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let err = "";
    proc.stderr?.on("data", (d: Buffer) => {
      err += d.toString();
    });
    proc.on("close", (code) => {
      resolve(code === 0);
    });
    proc.on("error", () => resolve(false));
    setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(false);
    }, 120_000);
  });
}

/**
 * Validate an object in B2 at `proxyObjectKey` is a usable standard proxy for STANDARD_PROXY_TRANSCODE_PROFILE.
 */
export async function validateStandardProxyPlayability(
  proxyObjectKey: string,
  options?: { skipFirstFrameDecode?: boolean }
): Promise<ProxyPlayabilityOk | ProxyPlayabilityFail> {
  const meta = await getObjectMetadata(proxyObjectKey);
  if (!meta) {
    return { ok: false, error: "proxy_object_missing" };
  }
  if (meta.contentLength < MIN_PROXY_SIZE_BYTES) {
    return {
      ok: false,
      error: `proxy_too_small:${meta.contentLength}`,
    };
  }

  let url: string;
  try {
    url = await createPresignedDownloadUrl(proxyObjectKey, PROBE_PRESIGN_TTL_SEC);
  } catch (e) {
    return {
      ok: false,
      error: `presign_failed:${e instanceof Error ? e.message : String(e)}`,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = await ffprobeJson(url);
  } catch (e) {
    return {
      ok: false,
      error: `ffprobe_failed:${e instanceof Error ? e.message.slice(0, 400) : String(e)}`,
    };
  }

  const format = parsed.format as Record<string, unknown> | undefined;
  const streams = parsed.streams as Array<Record<string, unknown>> | undefined;
  if (!format || !streams?.length) {
    return { ok: false, error: "ffprobe_no_format_or_streams" };
  }

  const formatName = String(format.format_name ?? "");
  if (!isMp4FamilyContainer(formatName)) {
    return {
      ok: false,
      error: `unexpected_container:${formatName.slice(0, 120)}`,
    };
  }

  const durationStr = String(format.duration ?? "0");
  const durationSec = parseFloat(durationStr);
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return { ok: false, error: `invalid_duration:${durationStr}` };
  }

  const videoStream = streams.find((s) => String(s.codec_type) === "video");
  if (!videoStream) {
    return { ok: false, error: "no_video_stream" };
  }

  const codecName = String(videoStream.codec_name ?? "");
  const codecTag = String(videoStream.codec_tag_string ?? "");
  if (!isH264Codec(codecName, codecTag)) {
    return {
      ok: false,
      error: `unexpected_video_codec:${codecName}:${codecTag}`,
    };
  }

  if (!options?.skipFirstFrameDecode) {
    const okFrame = await decodeFirstFrameSmokeTest(url);
    if (!okFrame) {
      return { ok: false, error: "first_frame_decode_failed" };
    }
  }

  return {
    ok: true,
    durationSec,
    sizeBytes: meta.contentLength,
    transcodeProfile: STANDARD_PROXY_TRANSCODE_PROFILE,
  };
}
