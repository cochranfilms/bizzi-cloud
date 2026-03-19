/**
 * Bizzi Cloud accepted file types for Storage and Recent Uploads.
 * Used by extract-metadata for media_type classification and to avoid probing documents as video.
 * Uppy multipart uploader accepts all files; this file defines how we classify them post-upload.
 */

/** Video extensions — media_type "video", may be probed for metadata. */
export const VIDEO_EXTENSIONS = [
  "mp4", "webm", "ogg", "mov", "m4v", "avi", "mxf", "mts", "m2ts", "ts", "mpg", "mpeg", "wmv", "mkv",
  "flv", "f4v", "3gp", "vob", "dv", "r3d", "braw", "ari", "crm", "rcd", "sir",
  "ogv", "ogm", "prores", "dnxhd", "dnxhr", "xavc", "xavcs", "xavchs", "xdcam", "avchd",
  "m2v", "y4m", "nut", "lrv", "thm",
  "dpx", "exr",
] as const;

/** Image/photo extensions — media_type "photo", Sharp may extract metadata. */
export const IMAGE_EXTENSIONS = [
  "jpg", "jpeg", "png", "webp", "gif", "tiff", "tif", "bmp", "heic", "heif", "svg",
  "psd", "psb", "ai", "dng", "cr2", "cr3", "nef", "nrw", "arw", "srf", "sr2", "raf",
  "orf", "rw2", "pef", "rwl", "srw", "x3f", "3fr", "fff", "iiq", "mos", "mef", "mrw",
  "erf", "kdc", "dcr", "bay", "cap", "eip", "crw",
] as const;

/**
 * Document extensions — never probe as video; ensures media_type and created_at persist.
 * Includes: office docs, text, spreadsheets, presentations, code, project exports, subtitles, archives, metadata.
 */
export const DOCUMENT_EXTENSIONS = [
  "pdf", "doc", "docx", "txt", "rtf", "md", "csv", "xls", "xlsx", "ods",
  "ppt", "pptx", "key", "odp", "json", "xml", "html", "htm", "css", "js", "ts", "cts",
  "prproj", "fcpxml", "drp", "drt", "srt", "vtt", "stl", "ass", "ssa", "lrc",
  "zip", "xmp", "ale", "edl", "aaf", "omf",
] as const;

const joinExt = (arr: readonly string[]) => [...new Set(arr)].join("|");

export const VIDEO_EXT = new RegExp(`\\.(${joinExt(VIDEO_EXTENSIONS as unknown as string[])})$`, "i");
export const IMAGE_EXT = new RegExp(`\\.(${joinExt(IMAGE_EXTENSIONS as unknown as string[])})$`, "i");
export const DOCUMENT_EXT = new RegExp(`\\.(${joinExt(DOCUMENT_EXTENSIONS as unknown as string[])})$`, "i");

export function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export function isDocumentFile(name: string): boolean {
  return DOCUMENT_EXT.test(name.toLowerCase());
}
