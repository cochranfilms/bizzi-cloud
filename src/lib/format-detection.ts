/**
 * File format detection and transcoder capability registry.
 * Categorizes video formats for proxy generation: direct support, RAW (special handling),
 * and unsupported.
 */

export type ProxyCapability = "direct" | "raw_unsupported" | "unsupported";

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

/** RAW camera formats that require special decoders (BRAW, R3D, ARRI, etc.). */
const RAW_EXT = new Set([
  "braw", // Blackmagic RAW
  "dng",  // DNG sequence / Cinema DNG
  "r3d",  // Red REDCODE
  "ari",  // ARRI RAW
  "arri",
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
  if (RAW_EXT.has(ext)) return "raw_unsupported";
  if (DIRECT_PROXY_EXT.has(ext)) return "direct";
  return "unsupported";
}

/** Returns true if format can be transcoded by our FFmpeg pipeline. */
export function canGenerateProxy(fileNameOrPath: string, mediaType?: string | null): boolean {
  return getProxyCapability(fileNameOrPath, mediaType) === "direct";
}
