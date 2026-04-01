/**
 * Creator RAW media policy — **camera / cinema RAW plus approved professional source codecs**
 * (ProRes, DNx, uncompressed, some image-sequence families, etc.). It is intentionally **not**
 * “sensor RAW only”. Generic delivery codecs (H.264, consumer HEVC, AV1, …) stay blocked; **narrow**
 * exceptions allow **Sony XAVC camera-original `.mp4` / `.m4v`** — **H.264 XAVC‑S/I** and **HEVC XAVC HS/S** —
 * when ffprobe metadata proves XAVC packaging (not generic consumer MP4).
 *
 * Extension and MIME are hints only; server enforcement primarily uses ffprobe (see creator-raw-media-probe.ts).
 * REDCODE `.r3d` and professional `.mxf` may finalize when ffprobe is incomplete or omits a standard codec id (see creator-raw-media-validator.ts).
 */

/** Short copy for the Creator tab banner (single source for product messaging). */
export const CREATOR_RAW_TAB_INTRO = {
  line1: "Creator workspace — current upload destination: RAW",
  line2:
    "While this folder is open, uploads and drag-and-drop go here. This tab is for camera RAW and approved source formats (ProRes/DNx mezzanine, cinema RAW, and Sony XAVC camera-original .mp4/.m4v — H.264 XAVC‑S/I or HEVC XAVC HS/S). Re-encoded or generic phone H.264/HEVC — use Storage.",
} as const;

/** User-facing copy shared by API responses and UI hints. */
export const CREATOR_RAW_REJECTION_MESSAGES = {
  notSupported:
    "This file is not a supported RAW or creator source format. Upload it to Storage instead.",
  deliveryCodec:
    "This video uses a delivery codec (for example H.264 or H.265), not a RAW or approved source codec. Creator RAW is for camera RAW and professional mezzanine sources only.",
  probeFailed:
    "We could not read this video’s technical metadata. Creator RAW only accepts files we can verify as RAW or an approved source format.",
  noVideoStream:
    "Creator RAW only accepts video or cinema camera source files with a readable video stream.",
  nonMediaLeaf:
    "This file type does not belong in Creator RAW. Use Storage for documents and other files.",
} as const;

/**
 * Cinema / professional leaves allowed to finalize when ffprobe cannot expose a reliable video codec/stream.
 * Must stay a subset of `rawCaptureExtensions`. (.braw is handled separately after a successful probe.)
 */
export const CREATOR_RAW_TRUST_EXTENSION_WHEN_PROBE_INCOMPLETE = new Set<string>(["r3d", "mxf"]);

export function isCreatorRawTrustExtensionWhenProbeIncomplete(ext: string): boolean {
  const e = ext.toLowerCase();
  return CREATOR_RAW_TRUST_EXTENSION_WHEN_PROBE_INCOMPLETE.has(e);
}

/**
 * ffprobe `codec_long_name` often names mezzanine codecs while `codec_name` stays `mpeg4` or `unknown`.
 * Only used when codec_name is missing, `mpeg4`, or `unknown` — never overrides H.264/HEVC/AV1 (see validator).
 */
const MEZZANINE_CODEC_LONG_NAME_REGEXES: readonly RegExp[] = [
  /\bapple\s+prores\b/i,
  /\bprores\b/i,
  /\bdnxhd\b/i,
  /\bdnxhr\b/i,
  /\bdnx\s*hd\b/i,
  /\bavdn\b/i,
  /\bvc[-\s]?3\b/i,
  /\bdigital\s+dnxhd\b/i,
  /\bcineform\b/i,
  /\bjpeg[\s-]?2000\b/i,
  /\bj2k\b/i,
];

export function looksLikeProfessionalMezzanineLongName(longName: string | null | undefined): boolean {
  const s = longName?.trim();
  if (!s) return false;
  return MEZZANINE_CODEC_LONG_NAME_REGEXES.some((re) => re.test(s));
}

/**
 * Sony cameras record **XAVC** (XAVC‑S/I H.264, XAVC HS / XAVC‑S HEVC) in MP4 with explicit branding in
 * ffprobe tags (`major_brand`, `compatible_brands`, `encoder`, etc.). Strong substrings so consumer AVC/HEVC stays blocked.
 */
const CAMERA_ORIGINAL_SONY_XAVC_HINT_REGEXES: readonly RegExp[] = [
  /\bxavc\b/i,
  /\bxavc[\s/_-]?(hs|s|i)\b/i,
  /\bxavchs\b/i,
  /\bsony\b[^\n]{0,160}\bxavc\b/i,
  /\bxavc\b[^\n]{0,160}\bsony\b/i,
];

/** True when combined ffprobe hint blob (stream + format tags, long name, profile) indicates Sony XAVC camera file. */
export function looksLikeSonyXavcCameraOriginalPackaging(hintBlob: string | null | undefined): boolean {
  const s = hintBlob?.trim();
  if (!s) return false;
  return CAMERA_ORIGINAL_SONY_XAVC_HINT_REGEXES.some((re) => re.test(s));
}

/** XAVC camera-original carve-outs (H.264 + HEVC) apply only to these leaves. */
export const CREATOR_RAW_XAVC_CAMERA_ORIGINAL_MP4_EXTENSIONS = new Set<string>(["mp4", "m4v"]);

export function isCreatorRawXavcCameraOriginalMp4Extension(ext: string): boolean {
  return CREATOR_RAW_XAVC_CAMERA_ORIGINAL_MP4_EXTENSIONS.has(ext.toLowerCase());
}

/** Stream and/or format fields ffprobe may expose beyond `codec_long_name` (often ProRes is only in `encoder`). */
export type FfprobeMezzanineHintSource = {
  codec_long_name?: string;
  tags?: Record<string, unknown> | null;
  /** ffprobe `profile` (e.g. HEVC Main 10) — folded into hint blob for XAVC / policy checks. */
  profile?: string;
};

export type FfprobeFormatForMezzanineHint = {
  tags?: Record<string, unknown> | null;
} | null | undefined;

const MEZZANINE_HINT_TAG_KEYS = [
  "encoder",
  "handler_name",
  "vendor_id",
  "com.apple.proapps.codec",
  "major_brand",
  "minor_version",
  "compatible_brands",
] as const;

function appendMezzanineHintTagValues(tags: Record<string, unknown> | null | undefined, parts: string[]): void {
  if (!tags || typeof tags !== "object") return;
  for (const key of MEZZANINE_HINT_TAG_KEYS) {
    const v = tags[key as string];
    if (v == null) continue;
    const s = typeof v === "string" ? v.trim() : String(v).trim();
    if (s) parts.push(s);
  }
}

/** Join long name + selected `tags` + format `tags` for mezzanine regexes (same gated codec rules in validator). */
export function buildFfprobeMezzanineHintBlob(
  stream: FfprobeMezzanineHintSource,
  format?: FfprobeFormatForMezzanineHint
): string {
  const parts: string[] = [];
  if (stream.codec_long_name?.trim()) parts.push(stream.codec_long_name.trim());
  if (stream.profile?.trim()) parts.push(stream.profile.trim());
  appendMezzanineHintTagValues(stream.tags ?? undefined, parts);
  appendMezzanineHintTagValues(format?.tags ?? undefined, parts);
  return parts.join(" | ");
}

/**
 * Single config object: allowed sets use normalized lowercase codec names / tags from ffprobe.
 */
export const CREATOR_RAW_MEDIA_POLICY = {
  /**
   * Containers (ffprobe `format.format_name` is often comma-separated, e.g. "mov,mp4,m4a,3gp,3g2,mj2").
   * Optional policy hook for logging / future rules; codec allowlist remains primary.
   */
  allowedContainers: [
    "mov",
    "mp4",
    "m4v",
    "avi",
    "matroska",
    "webm",
    "mxf",
    "mpegts",
    "flv",
    "asf",
    "red",
    "r3d",
    "gif", // rare demuxer string
  ] as const,

  /**
   * Video codec_name values from ffprobe that are allowed (professional mezzanine / uncompressed / camera).
   */
  allowedVideoCodecs: [
    "prores",
    "dnxhd",
    "dnxhr",
    "vc3",
    "cfhd", // CineForm
    "r210",
    "v210",
    "v408",
    "v410",
    "ayuv",
    "v308",
    "ffv1",
    "rawvideo",
    "jpeg2000",
    "ljpeg",
    "jpegls",
    "png",
    "tiff",
    "exr",
    "vpau",
    "r3d", // some builds
    "redcode",
    "arri",
    "hap",
  ] as const,

  /**
   * codec_tag_string (fourcc) allowlist — ProRes family, ProRes RAW, common DNx tags.
   * Some MP4/MOV files report `codec_name` as `unknown` while the tag identifies mezzanine.
   */
  allowedCodecTags: [
    "aprn",
    "aprx",
    "apco",
    "apcs",
    "apcn",
    "apch",
    "ap4h",
    "ap4x",
    "aprh",
    "avdn",
    "avdh",
    "avd1",
  ] as const,

  /**
   * Extensions that may be camera RAW / cinema; most still require an allowlisted codec from ffprobe.
   * Controlled exception: `.braw` — see `classifyCreatorRawMedia` (validator allows after successful
   * probe + video stream + non-blocked codec). If ffprobe cannot read the file, we fail closed.
   */
  rawCaptureExtensions: [
    "braw",
    "r3d",
    "ari",
    "arx",
    "crm",
    "dng",
    "mxf",
  ] as const,

  /**
   * Obvious non-video leaves — rejected before ffprobe to save work and give a clearer message.
   */
  nonCreatorRawLeafExtensions: [
    "txt",
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "csv",
    "json",
    "xml",
    "html",
    "htm",
    "md",
    "zip",
    "rar",
    "7z",
    "gz",
    "tar",
  ] as const,

  allowedExtensions: [
    "mp4",
    "mov",
    "m4v",
    "avi",
    "mkv",
    "webm",
    "mxf",
    "mts",
    "m2ts",
    "ts",
    "braw",
    "r3d",
    "ari",
    "crm",
    "dng",
  ] as const,

  /** Normalized codec_name values that are always rejected (delivery / consumer). */
  blockedVideoCodecs: [
    "h264",
    "avc",
    "hevc",
    "h265",
    "av1",
    "vp8",
    "vp9",
    "mpeg4",
    "msmpeg4v3",
    "msmpeg4v2",
    "msmpeg4",
    "mpeg2video",
    "mpeg1video",
    "mpegvideo",
    "wmv3",
    "wmv2",
    "wmv1",
    "wmavideo",
    "h263",
    "theora",
    "flv",
    "rv40",
    "rv30",
    "svq3",
  ] as const,

  /** codec_tag_string lowercased — delivery fourccs. */
  blockedCodecTags: [
    "avc1",
    "avc3",
    "hvc1",
    "hev1",
    "dvh1",
    "dvhe",
    "av01",
    "vp09",
    "vp08",
    "mp4v",
    "xvid",
    "fmp4",
  ] as const,

  /** If mime matches these (lowercase), treat as hint only — still probe; used for logging. */
  blockedMimePatterns: [/video\/mp4/i, /video\/quicktime/i, /video\/webm/i] as const,
} as const;

export type CreatorRawMediaPolicy = typeof CREATOR_RAW_MEDIA_POLICY;
