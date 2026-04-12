/**
 * Gallery type utilities – normalize gallery_type for backward compatibility.
 * Legacy galleries without gallery_type default to "photo".
 */
import type { GalleryType } from "@/types/gallery";

/** Normalize gallery_type – undefined/null from legacy records = photo */
export function normalizeGalleryType(value: unknown): GalleryType {
  if (value === "video") return "video";
  if (value === "mixed") return "mixed";
  return "photo";
}

/** Check if gallery is a video-only gallery */
export function isVideoGallery(gallery: { gallery_type?: unknown } | null | undefined): boolean {
  return normalizeGalleryType(gallery?.gallery_type) === "video";
}

/** Mixed final-delivery gallery (photos + videos). */
export function isMixedGallery(gallery: { gallery_type?: unknown } | null | undefined): boolean {
  return normalizeGalleryType(gallery?.gallery_type) === "mixed";
}

/** Video-style delivery controls (stream URL, featured clip, download policy, review copy). */
export function isVideoDeliveryGallery(
  gallery: { gallery_type?: unknown } | null | undefined
): boolean {
  const t = normalizeGalleryType(gallery?.gallery_type);
  return t === "video" || t === "mixed";
}

/** Check if gallery is a photo-only gallery */
export function isPhotoGallery(gallery: { gallery_type?: unknown } | null | undefined): boolean {
  return normalizeGalleryType(gallery?.gallery_type) === "photo";
}
