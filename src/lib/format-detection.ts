/**
 * File format detection and transcoder capability registry.
 * Categorizes video formats for proxy generation: direct support, RAW (special handling),
 * and unsupported.
 */

export type ProxyCapability = "direct" | "raw_try" | "raw_unsupported" | "unsupported";

/** Extensions that FFmpeg can decode and transcode directly (H.264/H.265/ProRes/MXF etc.) */
const DIRECT_PROXY_EXT = new Set([
  "mp4",
  "mov",
  "m4v",
  "avi",
  "mkv",
  "webm",
  "mts",
  "m2ts",
  "3gp",
  "mxf", // FFmpeg supports common MXF codecs
  "mpg",
  "mpeg",
  "ts",
  "flv",
  "wmv",
  "ogv",
]);

/**
 * RAW camera formats we attempt to proxy. FFmpeg has varying support:
 * R3D (REDCODE) - built-in demuxer; BRAW/ARRI - may need custom FFmpeg build.
 * On decode failure we mark raw_unsupported to avoid retries.
 */
const RAW_TRY_EXT = new Set([
  "braw", // Blackmagic RAW
  "r3d",  // Red REDCODE
  "ari",  // ARRI RAW
  "arri",
  "dng",  // CinemaDNG / DNG sequence
  "crm",  // Canon Cinema RAW Light
  "rcd",  // Red
  "sir",  // Silicon Imaging
]);

/** Minimum proxy file size (bytes) to consider valid. Rejects empty/corrupt outputs. */
export const MIN_PROXY_SIZE_BYTES = 100 * 1024; // 100 KB

/**
 * Detect proxy capability from file name (extension) and optional media_type.
 */
export function getProxyCapability(
  fileNameOrPath: string,
  mediaType?: string | null
): ProxyCapability {
  const ext = (fileNameOrPath.split(".").pop() ?? "").toLowerCase();
  if (!ext) {
    // Extension-less: rely on media_type from extract-metadata (e.g. video probe)
    return mediaType === "video" ? "direct" : "unsupported";
  }
  if (RAW_TRY_EXT.has(ext)) return "raw_try";
  if (DIRECT_PROXY_EXT.has(ext)) return "direct";
  return "unsupported";
}

/** Returns true if format can be transcoded (direct) or we should attempt (raw_try). */
export function canGenerateProxy(fileNameOrPath: string, mediaType?: string | null): boolean {
  const cap = getProxyCapability(fileNameOrPath, mediaType);
  return cap === "direct" || cap === "raw_try";
}

/** Returns true if file is Blackmagic RAW (.braw). Used to select BRAW-enabled FFmpeg when available. */
export function isBrawFile(fileNameOrPath: string): boolean {
  const ext = (fileNameOrPath.split(".").pop() ?? "").toLowerCase();
  return ext === "braw";
}
