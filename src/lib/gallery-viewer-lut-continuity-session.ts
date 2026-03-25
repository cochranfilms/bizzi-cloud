/**
 * Browser sessionStorage adapter for gallery LUT / MIX UI continuity only.
 *
 * This is not authoritative storage. It smooths refresh, back/forward, and same-device
 * flows until gallery-level preferences are persisted via API (see `gallery-viewer-lut-state.ts`).
 */

import { GALLERY_LUT_ORIGINAL_ID } from "@/lib/gallery-client-lut";

const MIX_PREFIX = "bizziGalleryLutMix:";
const SELECTED_ID_PREFIX = "bizziGalleryLutSelectedId:";
const PREVIEW_ON_PREFIX = "bizziGalleryLutPreviewOn:";

export function galleryViewerLutContinuityMixKey(galleryId: string): string {
  return `${MIX_PREFIX}${galleryId}`;
}

export function galleryViewerLutContinuitySelectedIdKey(galleryId: string): string {
  return `${SELECTED_ID_PREFIX}${galleryId}`;
}

export function galleryViewerLutContinuityPreviewOnKey(galleryId: string): string {
  return `${PREVIEW_ON_PREFIX}${galleryId}`;
}

/** @deprecated Use `galleryViewerLutContinuityMixKey` — kept for any external string refs */
export const galleryViewerLutMixKey = galleryViewerLutContinuityMixKey;
/** @deprecated Use `galleryViewerLutContinuitySelectedIdKey` */
export const galleryViewerLutSelectedIdKey = galleryViewerLutContinuitySelectedIdKey;
/** @deprecated Use `galleryViewerLutContinuityPreviewOnKey` */
export const galleryViewerLutPreviewOnKey = galleryViewerLutContinuityPreviewOnKey;

export function readGalleryViewerLutMixFromContinuitySession(galleryId: string): number {
  if (typeof window === "undefined") return 100;
  try {
    const raw = sessionStorage.getItem(galleryViewerLutContinuityMixKey(galleryId));
    if (raw == null) return 100;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n)) return 100;
    return Math.min(100, Math.max(0, n));
  } catch {
    return 100;
  }
}

/** Write full continuity snapshot (same-tab / refresh only). */
export function writeGalleryViewerLutContinuitySession(galleryId: string, state: {
  selectedLutId: string | null;
  lutPreviewEnabled: boolean;
  lutGradeMix: number;
}): void {
  if (typeof window === "undefined") return;
  try {
    const id = state.selectedLutId ?? GALLERY_LUT_ORIGINAL_ID;
    sessionStorage.setItem(galleryViewerLutContinuitySelectedIdKey(galleryId), id);
    sessionStorage.setItem(
      galleryViewerLutContinuityPreviewOnKey(galleryId),
      state.lutPreviewEnabled ? "1" : "0"
    );
    sessionStorage.setItem(
      galleryViewerLutContinuityMixKey(galleryId),
      String(Math.min(100, Math.max(0, state.lutGradeMix)))
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Partial fields recovered for GalleryView hydration (merge with server defaults).
 * Does not require preview-on to have been written.
 */
export function readGalleryViewerLutContinuityHydrationHints(galleryId: string): {
  previewEnabled?: boolean;
  selectedLutId?: string;
  mixPercent?: number;
} {
  if (typeof window === "undefined") return {};
  const out: {
    previewEnabled?: boolean;
    selectedLutId?: string;
    mixPercent?: number;
  } = {};
  try {
    const previewRaw = sessionStorage.getItem(galleryViewerLutContinuityPreviewOnKey(galleryId));
    if (previewRaw === "1" || previewRaw === "0") {
      out.previewEnabled = previewRaw === "1";
    }
    const idRaw = sessionStorage.getItem(galleryViewerLutContinuitySelectedIdKey(galleryId));
    if (idRaw != null) out.selectedLutId = idRaw;
    const mixRaw = sessionStorage.getItem(galleryViewerLutContinuityMixKey(galleryId));
    if (mixRaw != null) {
      const n = Number.parseInt(mixRaw, 10);
      if (!Number.isNaN(n)) out.mixPercent = Math.min(100, Math.max(0, n));
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Full continuity snapshot for mirroring / proofing only when the user has established
 * a session (preview on/off was written at least once). Otherwise null.
 */
export function readGalleryViewerLutContinuitySnapshotOrNull(galleryId: string): {
  selectedLutId: string;
  previewEnabled: boolean;
  mixPercent: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const previewRaw = sessionStorage.getItem(galleryViewerLutContinuityPreviewOnKey(galleryId));
    if (previewRaw !== "1" && previewRaw !== "0") return null;
    const idRaw =
      sessionStorage.getItem(galleryViewerLutContinuitySelectedIdKey(galleryId)) ??
      GALLERY_LUT_ORIGINAL_ID;
    return {
      selectedLutId: idRaw,
      previewEnabled: previewRaw === "1",
      mixPercent: readGalleryViewerLutMixFromContinuitySession(galleryId),
    };
  } catch {
    return null;
  }
}
