/**
 * File types supported for gallery uploads.
 * Standard images, delivery video, still RAW (incl. .dng), and cinema RAW video (.braw, .r3d, …).
 */

import { CINEMA_RAW_VIDEO_EXTENSIONS, isRawVideoFile } from "@/lib/raw-video";

/** Standard image extensions */
const STANDARD_IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "heic"] as const;

/** Standard delivery video (not cinema RAW) */
const STANDARD_VIDEO = ["mp4", "webm", "ogg", "mov", "m4v", "avi", "mxf", "mts", "mkv", "3gp"] as const;

/**
 * Still-photo and hybrid RAW extensions only — excludes cinema RAW video (see `CINEMA_RAW_VIDEO_EXTENSIONS`).
 * Plain .dng stays here (still workflow) until CinemaDNG sequence ingest exists.
 */
const RAW_STILL_EXTENSIONS = [
  "raw", "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "sr2", "srf",
  "raf", "rw2", "rwl", "orf", "pef", "x3f", "3fr", "fff", "iiq", "cap", "tii", "eip",
  "dcr", "kdc", "erf", "mef", "mos", "mrw", "srw", "bay",
] as const;

/** Union of still RAW + cinema RAW (for accept lists, “any camera raw” checks) */
const ALL_RAW_EXTENSIONS = [...RAW_STILL_EXTENSIONS, ...CINEMA_RAW_VIDEO_EXTENSIONS] as const;

const GALLERY_VIDEO_EXTENSION_PARTS = [...STANDARD_VIDEO, ...CINEMA_RAW_VIDEO_EXTENSIONS] as const;

/** All image extensions (standard + still RAW only — not .braw/.r3d/.ari) */
export const GALLERY_IMAGE_EXTENSIONS = [...STANDARD_IMAGE, ...RAW_STILL_EXTENSIONS] as const;

/** All extensions accepted for gallery upload (images + videos) */
export const GALLERY_UPLOAD_EXTENSIONS = [...GALLERY_IMAGE_EXTENSIONS, ...STANDARD_VIDEO, ...CINEMA_RAW_VIDEO_EXTENSIONS] as const;

/** Regex to test if a filename is an image (standard or still RAW) */
export const GALLERY_IMAGE_EXT =
  new RegExp(`\\.(${GALLERY_IMAGE_EXTENSIONS.join("|")})$`, "i");

/** Regex: delivery video + cinema RAW video */
export const GALLERY_VIDEO_EXT =
  new RegExp(`\\.(${GALLERY_VIDEO_EXTENSION_PARTS.join("|")})$`, "i");

/** Still-only RAW (exiftool / rawToThumbnail path) */
export const RAW_STILL_EXT =
  new RegExp(`\\.(${RAW_STILL_EXTENSIONS.join("|")})$`, "i");

/** Any RAW including cinema (legacy compatibility) */
export const RAW_EXT =
  new RegExp(`\\.(${ALL_RAW_EXTENSIONS.join("|")})$`, "i");

/** Accept attribute value for file inputs (comma-separated extensions) */
export const GALLERY_ACCEPT = GALLERY_UPLOAD_EXTENSIONS
  .map((e) => `.${e}`)
  .join(",");

/** Set for quick lookup in client-side filters */
export const GALLERY_UPLOAD_EXT_SET = new Set(
  GALLERY_UPLOAD_EXTENSIONS.map((e) => e.toLowerCase())
);

/**
 * Whether to call the image thumbnail API: extension on display name or object key path,
 * or `image/*` from metadata when the listed name omits an extension.
 */
export function isImageThumbnailTarget(
  fileName: string,
  objectKey?: string | null,
  contentType?: string | null
): boolean {
  if (contentType?.startsWith("image/")) return true;
  if (GALLERY_IMAGE_EXT.test(fileName)) return true;
  if (objectKey) {
    if (GALLERY_IMAGE_EXT.test(objectKey)) return true;
    const tail = objectKey.split("/").filter(Boolean).pop() ?? "";
    if (tail && GALLERY_IMAGE_EXT.test(tail)) return true;
  }
  return false;
}

/** Test if filename is a supported gallery file (image or video) */
export function isGalleryFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name) || GALLERY_VIDEO_EXT.test(name);
}

/** Test if filename is a video (delivery or cinema RAW) */
export function isGalleryVideo(name: string): boolean {
  return GALLERY_VIDEO_EXT.test(name);
}

/** Test if filename is an image (standard or still RAW) */
export function isGalleryImage(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
}

/** Still-photo RAW only — not .braw / .r3d / cinema RAW */
export function isRawStillFile(name: string): boolean {
  return RAW_STILL_EXT.test(name);
}

/** Any RAW still or cinema (backward compatible with previous `isRawFile`) */
export function isRawFile(name: string): boolean {
  return RAW_EXT.test(name);
}

/** Still-RAW thumbnail API (exiftool / libraw) — not cinema RAW */
export function shouldUseStillRawThumbnailPipeline(name: string): boolean {
  return isRawStillFile(name);
}

/** Re-export for call sites that explicitly need cinema set without importing raw-video */
export { CINEMA_RAW_VIDEO_EXTENSIONS, isRawVideoFile };
