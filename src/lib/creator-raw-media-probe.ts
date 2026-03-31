/**
 * Server-only: inspect media via ffprobe (JSON). Prefer URL probing so MP4/MOV with moov at end still parse.
 */

import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";
import { existsSync } from "fs";
import { CREATOR_RAW_MEDIA_POLICY } from "@/lib/creator-raw-media-config";
import { createPresignedDownloadUrl } from "@/lib/b2";
import type { InspectedMediaStreams } from "@/lib/creator-raw-media-types";

/** `ffprobe-static` ships as CommonJS. */
const ffprobeStatic = createRequire(import.meta.url)("ffprobe-static") as { path: string };

const ALLOWED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedVideoCodecs);
const ALLOWED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedCodecTags);
const BLOCKED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedVideoCodecs);
const BLOCKED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedCodecTags);

type StreamCategory = "allowed" | "blocked" | "neutral";

function categorizeFfprobeVideoStream(
  codecName: string | undefined,
  tagStr: string | undefined
): StreamCategory {
  const codec = codecName ? codecName.toLowerCase() : "";
  const tag = tagStr ? tagStr.toLowerCase() : "";
  if (BLOCKED_CODEC.has(codec)) return "blocked";
  if (tag && BLOCKED_TAG.has(tag)) return "blocked";
  if (ALLOWED_CODEC.has(codec)) return "allowed";
  if (tag && ALLOWED_TAG.has(tag)) return "allowed";
  if (!codec && !tag) return "neutral";
  return "neutral";
}

function pixelArea(s: FfprobeStream): number {
  const w = typeof s.width === "number" ? s.width : 0;
  const h = typeof s.height === "number" ? s.height : 0;
  return w * h;
}

function bestStreamByCategory(
  streams: FfprobeStream[],
  cat: StreamCategory
): FfprobeStream | undefined {
  const matches = streams.filter((s) => categorizeFfprobeVideoStream(s.codec_name, s.codec_tag_string) === cat);
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => (pixelArea(b) > pixelArea(a) ? b : a));
}

const execFileAsync = promisify(execFile);

const FFPROBE_TIMEOUT_MS = 120_000;

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  codec_tag_string?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  bits_per_raw_sample?: string | number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  disposition?: { attached_pic?: number };
};

type FfprobeJson = {
  format?: { format_name?: string; format_long_name?: string };
  streams?: FfprobeStream[];
};

function ffprobeStreamToInspected(video: FfprobeStream, formatName: string | null): InspectedMediaStreams {
  const rateStr = video.avg_frame_rate || video.r_frame_rate || "0/1";
  const [num, den] = rateStr.split("/").map((x) => parseInt(x, 10) || 0);
  const fps = den > 0 ? num / den : null;

  let bitDepth: number | null = null;
  if (video.bits_per_raw_sample != null) {
    const n =
      typeof video.bits_per_raw_sample === "number"
        ? video.bits_per_raw_sample
        : parseInt(String(video.bits_per_raw_sample), 10);
    if (!Number.isNaN(n) && n > 0) bitDepth = n;
  }

  return {
    detectedContainer: formatName,
    detectedVideoCodec: video.codec_name ? video.codec_name.toLowerCase() : null,
    detectedCodecTag: video.codec_tag_string ? video.codec_tag_string.toLowerCase() : null,
    detectedPixelFormat: video.pix_fmt ? video.pix_fmt.toLowerCase() : null,
    detectedBitDepth: bitDepth,
    detectedWidth: typeof video.width === "number" ? video.width : null,
    detectedHeight: typeof video.height === "number" ? video.height : null,
    detectedFrameRate: fps,
    hasVideoStream: true,
  };
}

/**
 * Pick the video stream that drives Creator RAW policy: skip cover-art tracks, prefer any
 * allowlisted mezzanine/RAW stream (largest area). If only delivery or unknown streams exist,
 * use the largest of those so validation messages still match the main picture.
 */
export function parseFfprobeVideoStream(json: FfprobeJson): InspectedMediaStreams {
  const streams = json.streams ?? [];
  const formatName = json.format?.format_name ?? null;
  const videos = streams.filter((s) => {
    if (s.codec_type !== "video") return false;
    if (s.disposition?.attached_pic === 1) return false;
    return true;
  });

  if (videos.length === 0) {
    return {
      detectedContainer: formatName,
      detectedVideoCodec: null,
      detectedCodecTag: null,
      detectedPixelFormat: null,
      detectedBitDepth: null,
      detectedWidth: null,
      detectedHeight: null,
      detectedFrameRate: null,
      hasVideoStream: false,
    };
  }

  const allowed = bestStreamByCategory(videos, "allowed");
  if (allowed) return ffprobeStreamToInspected(allowed, formatName);

  const blocked = bestStreamByCategory(videos, "blocked");
  if (blocked) return ffprobeStreamToInspected(blocked, formatName);

  const neutral = bestStreamByCategory(videos, "neutral");
  return ffprobeStreamToInspected(neutral ?? videos[0], formatName);
}

/**
 * Run ffprobe against a presigned B2 URL (inline) so fragmented/late moov MP4 still work.
 */
export async function inspectMediaObjectKey(objectKey: string): Promise<InspectedMediaStreams> {
  const bin = ffprobeStatic.path;
  if (!existsSync(bin)) {
    return {
      detectedContainer: null,
      detectedVideoCodec: null,
      detectedCodecTag: null,
      detectedPixelFormat: null,
      detectedBitDepth: null,
      detectedWidth: null,
      detectedHeight: null,
      detectedFrameRate: null,
      hasVideoStream: false,
      probeError: "ffprobe_binary_missing",
    };
  }

  let url: string;
  try {
    url = await createPresignedDownloadUrl(objectKey, 900, undefined, true);
  } catch (e) {
    return {
      detectedContainer: null,
      detectedVideoCodec: null,
      detectedCodecTag: null,
      detectedPixelFormat: null,
      detectedBitDepth: null,
      detectedWidth: null,
      detectedHeight: null,
      detectedFrameRate: null,
      hasVideoStream: false,
      probeError: e instanceof Error ? e.message : "presign_failed",
    };
  }

  try {
    const { stdout } = await execFileAsync(
      bin,
      [
        "-v",
        "quiet",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        "-analyzeduration",
        "100M",
        "-probesize",
        "100M",
        url,
      ],
      {
        timeout: FFPROBE_TIMEOUT_MS,
        maxBuffer: 12 * 1024 * 1024,
      }
    );
    const parsed = JSON.parse(stdout) as FfprobeJson;
    return parseFfprobeVideoStream(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      detectedContainer: null,
      detectedVideoCodec: null,
      detectedCodecTag: null,
      detectedPixelFormat: null,
      detectedBitDepth: null,
      detectedWidth: null,
      detectedHeight: null,
      detectedFrameRate: null,
      hasVideoStream: false,
      probeError: msg.slice(0, 500),
    };
  }
}

/** Alias for naming consistency across codebase docs. */
export const inspectMediaFile = inspectMediaObjectKey;

/** Test helper: classify from already-parsed ffprobe JSON. */
export function inspectMediaFromFfprobeJson(json: unknown): InspectedMediaStreams {
  return parseFfprobeVideoStream(json as FfprobeJson);
}
