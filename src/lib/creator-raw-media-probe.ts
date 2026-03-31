/**
 * Server-only: inspect media via ffprobe (JSON). Prefer URL probing so MP4/MOV with moov at end still parse.
 */

import { execFile } from "child_process";
import { createRequire } from "module";
import { promisify } from "util";
import { existsSync } from "fs";
import {
  CREATOR_RAW_MEDIA_POLICY,
  looksLikeProfessionalMezzanineLongName,
} from "@/lib/creator-raw-media-config";
import { createPresignedDownloadUrl } from "@/lib/b2";
import type { InspectedMediaStreams } from "@/lib/creator-raw-media-types";

/** `ffprobe-static` ships as CommonJS. */
const ffprobeStatic = createRequire(import.meta.url)("ffprobe-static") as { path: string };

const ALLOWED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedVideoCodecs);
const ALLOWED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.allowedCodecTags);
const BLOCKED_CODEC = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedVideoCodecs);
const BLOCKED_TAG = new Set<string>(CREATOR_RAW_MEDIA_POLICY.blockedCodecTags);
/** Used to disambiguate BE vs LE when `codec_tag_string` is missing (common for ProRes in MP4). */
const POLICY_CODEC_TAGS = new Set<string>([...ALLOWED_TAG, ...BLOCKED_TAG]);

type StreamCategory = "allowed" | "blocked" | "neutral";

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  codec_tag?: string | number;
  codec_tag_string?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  coded_width?: number;
  coded_height?: number;
  bit_rate?: string | number;
  bits_per_raw_sample?: string | number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  codec_long_name?: string;
  disposition?: { attached_pic?: number };
};

function fourccFromBigEndianU32(n: number): string | null {
  const b0 = (n >>> 24) & 0xff;
  const b1 = (n >>> 16) & 0xff;
  const b2 = (n >>> 8) & 0xff;
  const b3 = n & 0xff;
  if ([b0, b1, b2, b3].some((b) => b < 32 || b > 126)) return null;
  return String.fromCharCode(b0, b1, b2, b3).toLowerCase();
}

function fourccFromLittleEndianU32(n: number): string | null {
  const b0 = n & 0xff;
  const b1 = (n >>> 8) & 0xff;
  const b2 = (n >>> 16) & 0xff;
  const b3 = (n >>> 24) & 0xff;
  if ([b0, b1, b2, b3].some((b) => b < 32 || b > 126)) return null;
  return String.fromCharCode(b0, b1, b2, b3).toLowerCase();
}

/**
 * When ffprobe omits `codec_tag_string`, derive a fourcc from `codec_tag` (hex or u32).
 * MP4 often stores LE tags (e.g. avc1 → 0x31637661); ProRes tags match big-endian unpack.
 */
function fourccFromCodecTagField(raw: string | number | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.length === 4 && /^[\x20-\x7e]+$/.test(s)) return s.toLowerCase();
    if (/^0x[0-9a-f]+$/i.test(s)) {
      const n = (parseInt(s, 16) >>> 0) || 0;
      return pickPolicyFourccEndian(n);
    }
    if (/^\d+$/.test(s)) {
      const n = (parseInt(s, 10) >>> 0) || 0;
      return pickPolicyFourccEndian(n);
    }
    return null;
  }
  return pickPolicyFourccEndian((raw as number) >>> 0);
}

function pickPolicyFourccEndian(n: number): string | null {
  if (n === 0) return null;
  const be = fourccFromBigEndianU32(n);
  const le = fourccFromLittleEndianU32(n);
  const beHit = be != null && POLICY_CODEC_TAGS.has(be);
  const leHit = le != null && POLICY_CODEC_TAGS.has(le);
  if (beHit && !leHit) return be;
  if (leHit && !beHit) return le;
  if (beHit && leHit) return be;
  /** Printable fourcc outside known policy — still expose to validator (may be a new mezzanine tag). */
  return be ?? le ?? null;
}

function effectiveCodecTagString(stream: FfprobeStream): string | undefined {
  const explicit = stream.codec_tag_string?.trim();
  if (explicit) return explicit;
  const derived = fourccFromCodecTagField(stream.codec_tag);
  return derived ?? undefined;
}

function normalizedCodecName(stream: FfprobeStream): string | undefined {
  const c = stream.codec_name?.trim();
  if (!c) return undefined;
  return c.toLowerCase();
}

function categorizeFfprobeVideoStream(
  codecName: string | undefined,
  tagStr: string | undefined,
  codecLongName?: string | undefined
): StreamCategory {
  const codec = (codecName ?? "").trim().toLowerCase();
  const tag = (tagStr ?? "").trim().toLowerCase();
  /** ProRes/DNx fourccs win over generic codec_name (ProRes-in-MP4 often reports `mpeg4`). */
  if (tag && ALLOWED_TAG.has(tag)) return "allowed";
  if (
    looksLikeProfessionalMezzanineLongName(codecLongName) &&
    (!codec || codec === "mpeg4" || codec === "unknown")
  ) {
    return "allowed";
  }
  if (codec && BLOCKED_CODEC.has(codec)) return "blocked";
  if (tag && BLOCKED_TAG.has(tag)) return "blocked";
  if (codec && ALLOWED_CODEC.has(codec)) return "allowed";
  if (!codec && !tag) return "neutral";
  return "neutral";
}

function parseBitRate(v: string | number | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function effectivePixelArea(s: FfprobeStream): number {
  const validDim = (n: number | undefined) => typeof n === "number" && n > 0;
  const w = validDim(s.width) ? (s.width as number) : 0;
  const h = validDim(s.height) ? (s.height as number) : 0;
  if (w > 0 && h > 0) return w * h;
  const cw = validDim(s.coded_width) ? (s.coded_width as number) : 0;
  const ch = validDim(s.coded_height) ? (s.coded_height as number) : 0;
  if (cw > 0 && ch > 0) return cw * ch;
  return 0;
}

/** Prefer larger frame / bitrate; tie-break earlier stream index (main program often first). */
function streamRankTuple(s: FfprobeStream, streamIndex: number): [number, number, number] {
  return [effectivePixelArea(s), parseBitRate(s.bit_rate), -streamIndex];
}

function betterRankedStream(
  a: { stream: FfprobeStream; index: number },
  b: { stream: FfprobeStream; index: number }
): { stream: FfprobeStream; index: number } {
  const ta = streamRankTuple(a.stream, a.index);
  const tb = streamRankTuple(b.stream, b.index);
  for (let i = 0; i < ta.length; i++) {
    if (tb[i] !== ta[i]) return tb[i] > ta[i] ? b : a;
  }
  return a;
}

function bestStreamByCategory(
  videos: { stream: FfprobeStream; index: number }[],
  cat: StreamCategory
): FfprobeStream | undefined {
  const matches = videos.filter(
    (v) =>
      categorizeFfprobeVideoStream(
        normalizedCodecName(v.stream),
        effectiveCodecTagString(v.stream),
        v.stream.codec_long_name
      ) === cat
  );
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => betterRankedStream(a, b)).stream;
}

const execFileAsync = promisify(execFile);

const FFPROBE_TIMEOUT_MS = 120_000;

type FfprobeJson = {
  format?: { format_name?: string; format_long_name?: string };
  streams?: FfprobeStream[];
};

function normalizeDimension(
  display: number | undefined,
  coded: number | undefined
): number | null {
  const valid = (n: number | undefined) => typeof n === "number" && n > 0;
  if (valid(display)) return display as number;
  if (valid(coded)) return coded as number;
  return null;
}

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

  const tag = effectiveCodecTagString(video);
  const longName = video.codec_long_name?.trim() || null;
  return {
    detectedContainer: formatName,
    detectedVideoCodec: normalizedCodecName(video) ?? null,
    detectedCodecLongName: longName,
    detectedCodecTag: tag ? tag.toLowerCase() : null,
    detectedPixelFormat: video.pix_fmt ? video.pix_fmt.toLowerCase() : null,
    detectedBitDepth: bitDepth,
    detectedWidth: normalizeDimension(video.width, video.coded_width),
    detectedHeight: normalizeDimension(video.height, video.coded_height),
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
  const videos: { stream: FfprobeStream; index: number }[] = [];
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i];
    if (s.codec_type !== "video") continue;
    if (s.disposition?.attached_pic === 1) continue;
    videos.push({ stream: s, index: i });
  }

  if (videos.length === 0) {
    return {
      detectedContainer: formatName,
      detectedVideoCodec: null,
      detectedCodecLongName: null,
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
  return ffprobeStreamToInspected(neutral ?? videos[0].stream, formatName);
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
      detectedCodecLongName: null,
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
      detectedCodecLongName: null,
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
      detectedCodecLongName: null,
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
