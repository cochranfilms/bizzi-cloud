/**
 * File types supported for gallery uploads.
 * Includes standard images, videos, and RAW camera formats.
 */

/** Standard image extensions */
const STANDARD_IMAGE = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "ico", "heic"] as const;

/** Standard video extensions */
const STANDARD_VIDEO = ["mp4", "webm", "ogg", "mov", "m4v", "avi", "mxf"] as const;

/** RAW formats: generic and brand-specific (still photo + cinema crossover) */
const RAW_EXTENSIONS = [
  "raw", "dng", "cr2", "cr3", "crw", "nef", "nrw", "arw", "sr2", "srf",
  "raf", "rw2", "rwl", "orf", "pef", "x3f", "3fr", "fff", "iiq", "cap", "tii", "eip",
  "dcr", "kdc", "erf", "mef", "mos", "mrw", "srw", "bay",
  "r3d", "braw", "ari",
] as const;

/** All image extensions (standard + RAW) - for gallery assets API */
export const GALLERY_IMAGE_EXTENSIONS = [...STANDARD_IMAGE, ...RAW_EXTENSIONS] as const;

/** All extensions accepted for gallery upload (images + videos) */
export const GALLERY_UPLOAD_EXTENSIONS = [...GALLERY_IMAGE_EXTENSIONS, ...STANDARD_VIDEO] as const;

/** Regex to test if a filename is an image (standard or RAW) */
export const GALLERY_IMAGE_EXT =
  new RegExp(`\\.(${GALLERY_IMAGE_EXTENSIONS.join("|")})$`, "i");

/** Regex to test if a filename is a video */
export const GALLERY_VIDEO_EXT =
  new RegExp(`\\.(${STANDARD_VIDEO.join("|")})$`, "i");

/** Accept attribute value for file inputs (comma-separated extensions) */
export const GALLERY_ACCEPT = GALLERY_UPLOAD_EXTENSIONS
  .map((e) => `.${e}`)
  .join(",");

/** Set for quick lookup in client-side filters */
export const GALLERY_UPLOAD_EXT_SET = new Set(
  GALLERY_UPLOAD_EXTENSIONS.map((e) => e.toLowerCase())
);

/** Test if filename is a supported gallery file (image or video) */
export function isGalleryFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name) || GALLERY_VIDEO_EXT.test(name);
}
