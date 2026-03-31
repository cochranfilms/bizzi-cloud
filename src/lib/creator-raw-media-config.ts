/**
 * Creator RAW media policy — **camera / cinema RAW plus approved professional source codecs**
 * (ProRes, DNx, uncompressed, some image-sequence families, etc.). It is intentionally **not**
 * “sensor RAW only”; delivery codecs (H.264, HEVC, AV1, …) are blocked regardless of container.
 *
 * Extension and MIME are hints only; server enforcement uses ffprobe (see creator-raw-media-probe.ts).
 */

/** Short copy for the Creator tab banner (single source for product messaging). */
export const CREATOR_RAW_TAB_INTRO = {
  line1: "Creator workspace — current upload destination: RAW",
  line2:
    "While this folder is open, uploads and drag-and-drop go here. This tab is for camera RAW and approved professional source formats (including common mezzanine codecs), not everyday H.264/H.265 exports — use Storage for those.",
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
