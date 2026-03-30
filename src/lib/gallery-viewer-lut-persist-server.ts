/**
 * Server-side parse/validation for gallery viewer LUT preferences (Firestore).
 */

import { GALLERY_LUT_ORIGINAL_ID } from "@/lib/gallery-client-lut";
import type { GalleryViewerLutPreferences } from "@/types/gallery-viewer-lut";

export function buildValidViewerLutIdSet(
  creativeLibrary: Array<{ id?: string }>,
  galleryType: "photo" | "video"
): Set<string> {
  const s = new Set<string>([GALLERY_LUT_ORIGINAL_ID]);
  if (galleryType === "video") {
    s.add("sony_rec709");
  }
  for (const e of creativeLibrary) {
    if (typeof e.id === "string" && e.id.length > 0) {
      s.add(e.id);
    }
  }
  return s;
}

/**
 * Normalize Firestore value for GET /view; null if missing or invalid (e.g. removed LUT id).
 * Invalid `selectedLutId` (not in `validIds`) yields null so the client re-hydrates from defaults + continuity.
 */
export function normalizeStoredViewerLutPreferences(
  raw: unknown,
  validIds: Set<string>
): GalleryViewerLutPreferences | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const selectedLutId = typeof o.selectedLutId === "string" ? o.selectedLutId.trim() : "";
  if (!selectedLutId || !validIds.has(selectedLutId)) return null;
  const lutPreviewEnabled = o.lutPreviewEnabled === true;
  let gradeMixPercent = 100;
  if (typeof o.gradeMixPercent === "number" && Number.isFinite(o.gradeMixPercent)) {
    gradeMixPercent = Math.min(100, Math.max(0, Math.round(o.gradeMixPercent)));
  } else if (typeof o.gradeMixPercent === "string") {
    const n = Number.parseInt(o.gradeMixPercent, 10);
    if (!Number.isNaN(n)) {
      gradeMixPercent = Math.min(100, Math.max(0, n));
    }
  }
  return { selectedLutId, lutPreviewEnabled, gradeMixPercent };
}

export function parseViewerLutPreferencesPatchBody(body: unknown):
  | { ok: true; value: GalleryViewerLutPreferences }
  | { ok: false; error: string } {
  if (body == null || typeof body !== "object") {
    return { ok: false, error: "JSON body required" };
  }
  const o = body as Record<string, unknown>;
  if (typeof o.selectedLutId !== "string" || !o.selectedLutId.trim()) {
    return { ok: false, error: "selectedLutId must be a non-empty string" };
  }
  if (typeof o.lutPreviewEnabled !== "boolean") {
    return { ok: false, error: "lutPreviewEnabled must be a boolean" };
  }
  if (typeof o.gradeMixPercent !== "number" || !Number.isFinite(o.gradeMixPercent)) {
    return { ok: false, error: "gradeMixPercent must be a number" };
  }
  const gradeMixPercent = Math.min(100, Math.max(0, Math.round(o.gradeMixPercent)));
  return {
    ok: true,
    value: {
      selectedLutId: o.selectedLutId.trim(),
      lutPreviewEnabled: o.lutPreviewEnabled,
      gradeMixPercent,
    },
  };
}
