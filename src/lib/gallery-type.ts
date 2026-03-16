/**
 * Gallery type utilities – normalize gallery_type for backward compatibility.
 * Legacy galleries without gallery_type default to "photo".
 */
import type { GalleryType } from "@/types/gallery";

/** Normalize gallery_type – undefined/null from legacy records = photo */
export function normalizeGalleryType(value: unknown): GalleryType {
  if (value === "video") return "video";
  return "photo";
}

/** Check if gallery is a video gallery */
export function isVideoGallery(gallery: { gallery_type?: unknown } | null | undefined): boolean {
  return normalizeGalleryType(gallery?.gallery_type) === "video";
}

/** Check if gallery is a photo gallery */
export function isPhotoGallery(gallery: { gallery_type?: unknown } | null | undefined): boolean {
  return normalizeGalleryType(gallery?.gallery_type) === "photo";
}
