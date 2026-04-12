/**
 * Shared UX copy for owner-facing gallery profile (Final vs RAW).
 */

export type GalleryProfileMediaMode = "final" | "raw";
export type GalleryProfileKind = "photo" | "video" | "mixed";

export function galleryProfileTitle(kind: GalleryProfileKind, mode: GalleryProfileMediaMode): string {
  if (kind === "mixed") {
    return "Mixed Final Delivery Gallery";
  }
  if (kind === "video") {
    return mode === "raw" ? "RAW Video Gallery" : "Final Video Gallery";
  }
  return mode === "raw" ? "RAW Photo Gallery" : "Final Photo Gallery";
}

export function galleryProfileDetailDescription(
  kind: GalleryProfileKind,
  mode: GalleryProfileMediaMode,
): string {
  if (kind === "mixed") {
    return "Final delivery only — upload edited photos and finished videos together. Clients get the same proofing, playback, and download behavior as your standalone photo and video delivery galleries, without RAW or LUT review tools.";
  }
  if (kind === "video") {
    return mode === "raw"
      ? "Original camera or log-style footage; on-screen LUT preview may help during review when enabled. If you switch this gallery to Final Delivery, source video files you uploaded here are archived into a folder named RAW inside this gallery’s folder in Gallery Media — nothing is permanently deleted."
      : "Edited, client-ready video — best for delivery, playback, and standard client viewing.";
  }
  return mode === "raw"
    ? "Original camera photo files such as ARW, CR3, NEF, DNG — best for source review and optional LUT preview workflows."
    : "Edited, client-ready, preview-friendly photos — best for delivery and everyday viewing.";
}

/** Persistent helper above upload drop zone (photo). */
export function galleryUploadHelperPhoto(mode: GalleryProfileMediaMode): string {
  return mode === "raw"
    ? "Best for original camera files and source review workflows. Delivery-ready JPG and PNG files are allowed, but this gallery is optimized for RAW review and LUT preview."
    : "Best for edited delivery images such as JPG and PNG. Camera RAW files may preview poorly here — use a RAW Photo Gallery for originals.";
}

/** Persistent helper above upload drop zone (video). */
export function galleryUploadHelperVideo(mode: GalleryProfileMediaMode): string {
  return mode === "raw"
    ? "Best for source or log-style footage where LUT preview during review can help. Export-ready files are fine too."
    : "Best for edited, delivery-ready video files — best for client viewing and downloads when enabled.";
}

/** Mixed galleries: final delivery photos and videos only (no RAW/LUT workflows). */
export function galleryUploadHelperMixed(): string {
  return "Final delivery photos and edited videos together — same client experience as your Final photo and Final video galleries. Camera RAW and log/RAW video workflows belong in dedicated RAW galleries.";
}
