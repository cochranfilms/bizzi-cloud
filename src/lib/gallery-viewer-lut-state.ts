/**
 * Gallery viewer LUT + MIX preferences — resolution layer.
 *
 * **Authoritative (planned):** gallery-level fields from the API / database so the same look
 * loads on any device. Shape: {@link GalleryViewerLutPreferencesPersisted}.
 *
 * **Continuity (today):** `sessionStorage` via `gallery-viewer-lut-continuity-session.ts` — same
 * browser tab/session only; used for refresh and temporary UI continuity until DB persistence ships.
 *
 * Call sites should use this module (not raw `sessionStorage`) so we can merge API + continuity
 * in one place later.
 */

import type { ViewGalleryLike } from "@/lib/gallery-dashboard-lut-preview";
import {
  buildGalleryLUTOptions,
  GALLERY_LUT_ORIGINAL_ID,
  resolveGalleryClientLutSource,
  resolveGalleryCreativeLutEnabledFromPayload,
} from "@/lib/gallery-client-lut";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import {
  readGalleryViewerLutContinuityHydrationHints,
  readGalleryViewerLutContinuitySnapshotOrNull,
  readGalleryViewerLutMixFromContinuitySession,
  writeGalleryViewerLutContinuitySession,
} from "@/lib/gallery-viewer-lut-continuity-session";
import type {
  GalleryViewerLutPreferences,
  GalleryViewerLutPreferencesPersisted,
} from "@/types/gallery-viewer-lut";

export type { GalleryViewerLutPreferences, GalleryViewerLutPreferencesPersisted };

function isCompleteViewerLutPreferences(v: unknown): v is GalleryViewerLutPreferences {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.selectedLutId !== "string" || !o.selectedLutId.trim()) return false;
  if (typeof o.lutPreviewEnabled !== "boolean") return false;
  if (typeof o.gradeMixPercent !== "number" || !Number.isFinite(o.gradeMixPercent)) return false;
  return true;
}

/**
 * Resolved preferences for the viewer: **database wins** when provided; otherwise continuity session.
 *
 * @param persistedFromApi - When the view API (or a dedicated endpoint) returns saved prefs,
 *        pass them here. `undefined` = not loaded / field not present yet (use continuity).
 *        Future: `null` could mean "explicitly cleared on server" — merge rules TBD.
 */
export function getGalleryViewerLutPreferencesResolved(
  galleryId: string,
  persistedFromApi?: GalleryViewerLutPreferences | null
): GalleryViewerLutPreferences | null {
  if (isCompleteViewerLutPreferences(persistedFromApi)) {
    return persistedFromApi;
  }
  const snap = readGalleryViewerLutContinuitySnapshotOrNull(galleryId);
  if (!snap) return null;
  return {
    selectedLutId: snap.selectedLutId,
    lutPreviewEnabled: snap.previewEnabled,
    gradeMixPercent: snap.mixPercent,
  };
}

/** Merge hints for GalleryView bootstrap (server defaults + continuity overlays). */
export function readGalleryViewerLutContinuityHydration(galleryId: string): ReturnType<
  typeof readGalleryViewerLutContinuityHydrationHints
> {
  return readGalleryViewerLutContinuityHydrationHints(galleryId);
}

/** Initial mix for `useState` before API hydration. */
export function readGalleryViewerLutMixInitial(galleryId: string): number {
  return readGalleryViewerLutMixFromContinuitySession(galleryId);
}

/**
 * Writes session continuity only. When DB persistence exists, this should remain for
 * same-tab UX and optionally run alongside (or after) something like:
 * `PATCH /api/galleries/[id]/viewer-lut-preferences` with {@link GalleryViewerLutPreferencesPersisted}.
 */
export function persistGalleryViewerLutContinuity(galleryId: string, state: {
  selectedLutId: string | null;
  lutPreviewEnabled: boolean;
  lutGradeMix: number;
}): void {
  writeGalleryViewerLutContinuitySession(galleryId, state);
}

/**
 * Owner proofing grid: match the resolved viewer prefs (DB when present, else continuity).
 * When there is no persisted row and no continuity snapshot, returns ungraded thumbnails.
 */
export function resolveProofingGridLutMirror(
  galleryId: string,
  viewGallery: ViewGalleryLike | null,
  /** When `GET /view` (or similar) includes saved viewer prefs, pass them here. */
  persistedViewerPrefs?: GalleryViewerLutPreferences | null
): {
  previewLutSource: string | null;
  lutWorkflowActive: boolean;
  lutGradeMixPercent: number;
} {
  if (!viewGallery || typeof window === "undefined") {
    return { previewLutSource: null, lutWorkflowActive: false, lutGradeMixPercent: 100 };
  }

  const isVideo = viewGallery.gallery_type === "video";
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: viewGallery.media_mode ?? null,
    source_format: viewGallery.source_format ?? null,
  });
  const lutWorkflowActive = !isVideo && mediaMode === "raw";
  const lutOn = resolveGalleryCreativeLutEnabledFromPayload(viewGallery);
  const mix = readGalleryViewerLutMixFromContinuitySession(galleryId);

  const resolved = getGalleryViewerLutPreferencesResolved(galleryId, persistedViewerPrefs);

  if (!lutWorkflowActive || !lutOn) {
    return {
      previewLutSource: null,
      lutWorkflowActive,
      lutGradeMixPercent: resolved?.gradeMixPercent ?? mix,
    };
  }

  if (!resolved || !resolved.lutPreviewEnabled) {
    return { previewLutSource: null, lutWorkflowActive, lutGradeMixPercent: resolved?.gradeMixPercent ?? mix };
  }

  const opts = buildGalleryLUTOptions(viewGallery.creative_lut_library, false, undefined);
  const selectedId =
    resolved.selectedLutId != null && opts.some((o) => o.id === resolved.selectedLutId)
      ? resolved.selectedLutId
      : GALLERY_LUT_ORIGINAL_ID;

  const previewLutSource = resolveGalleryClientLutSource({
    lutEnabled: true,
    lutPreviewEnabled: true,
    selectedLutId: selectedId,
    options: opts,
    ownerDefaultSource: viewGallery.lut?.lut_source ?? viewGallery.lut?.storage_url ?? null,
  });

  return {
    previewLutSource,
    lutWorkflowActive,
    lutGradeMixPercent: resolved.gradeMixPercent,
  };
}
