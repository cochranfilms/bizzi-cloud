/**
 * Classify gallery filenames for upload hints and preview eligibility.
 */

import {
  GALLERY_IMAGE_EXT,
  GALLERY_VIDEO_EXT,
  isRawFile,
} from "@/lib/gallery-file-types";

export type GalleryMediaKind = "photo" | "video" | "other";

export interface ClassifiedFilename {
  kind: GalleryMediaKind;
  ext: string;
  /** Camera RAW still (ARW, CR3, …) */
  isRawPhoto: boolean;
  /** Known video extension */
  isVideo: boolean;
}

export function classifyGalleryFilename(fileName: string): ClassifiedFilename {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot + 1) : "";

  const isVideo = GALLERY_VIDEO_EXT.test(fileName);
  const isImage = GALLERY_IMAGE_EXT.test(fileName);
  const rawPhoto = isRawFile(fileName) && !isVideo;

  let kind: GalleryMediaKind = "other";
  if (isVideo) kind = "video";
  else if (isImage) kind = "photo";

  return {
    kind,
    ext,
    isRawPhoto: rawPhoto,
    isVideo,
  };
}

/** True if upload is likely a delivery still (not camera RAW). */
export function isLikelyFinalPhotoName(fileName: string): boolean {
  const c = classifyGalleryFilename(fileName);
  return c.kind === "photo" && !c.isRawPhoto;
}
