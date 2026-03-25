/**
 * Gallery media mode: Final (delivery-ready) vs RAW (source / LUT review).
 * Legacy `source_format` ("jpg" | "raw") is mirrored for older documents.
 */

import type { MediaMode } from "@/types/gallery";

export type { MediaMode };

export function normalizeGalleryMediaMode(g: {
  media_mode?: string | null;
  source_format?: string | null;
}): MediaMode {
  if (g.media_mode === "raw") return "raw";
  if (g.media_mode === "final") return "final";
  if (g.source_format === "raw") return "raw";
  return "final";
}

/** Resolve mode from API create body (supports media_mode + legacy source_format). */
export function resolveMediaModeFromCreateBody(body: {
  media_mode?: string | null;
  source_format?: string | null;
}): MediaMode {
  const mm = typeof body.media_mode === "string" ? body.media_mode.toLowerCase() : "";
  if (mm === "raw" || mm === "final") return mm as MediaMode;
  if (body.source_format === "raw") return "raw";
  return "final";
}

/** Keep legacy Firestore field in sync for older readers. */
export function legacySourceFormatFromMediaMode(mode: MediaMode): "jpg" | "raw" {
  return mode === "raw" ? "raw" : "jpg";
}

export function isValidMediaMode(v: unknown): v is MediaMode {
  return v === "final" || v === "raw";
}
