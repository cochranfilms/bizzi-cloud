/**
 * Single deterministic resolver for **video gallery** public LUT display state.
 * No silent URL fallback: source comes only from the sanitized preset id + options list.
 */

import type { GalleryLutOption } from "@/lib/gallery-client-lut";
import { GALLERY_LUT_ORIGINAL_ID } from "@/lib/gallery-client-lut";

export type PublicVideoGalleryLutFallbackReason =
  | null
  | "owner_disabled"
  | "viewer_disabled"
  | "original_selected"
  | "invalid_selection"
  | "missing_source";

export type ResolvedPublicVideoGalleryLutDisplayState = {
  enabledByOwner: boolean;
  previewEnabled: boolean;
  sanitizedSelectedLutId: string;
  resolvedLutSource: string | null;
  shouldApplyLut: boolean;
  fallbackReason: PublicVideoGalleryLutFallbackReason;
  /** True when `selectedLutId` was not in `options` and was clamped. */
  selectionWasSanitized: boolean;
};

function hasOptionId(options: GalleryLutOption[], id: string): boolean {
  return options.some((o) => o.id === id);
}

/**
 * Clamp invalid viewer/owner selection to a valid option id (ID layer only; no URL fallback).
 */
export function sanitizeVideoGalleryLutSelection(
  selectedLutId: string,
  options: GalleryLutOption[],
  ownerDefaultLutId: string | null | undefined
): { id: string; wasSanitized: boolean } {
  if (hasOptionId(options, selectedLutId)) {
    return { id: selectedLutId, wasSanitized: false };
  }
  const owner =
    typeof ownerDefaultLutId === "string" && ownerDefaultLutId.trim()
      ? ownerDefaultLutId.trim()
      : null;
  if (owner && hasOptionId(options, owner)) {
    return { id: owner, wasSanitized: true };
  }
  if (hasOptionId(options, "sony_rec709")) {
    return { id: "sony_rec709", wasSanitized: true };
  }
  return { id: GALLERY_LUT_ORIGINAL_ID, wasSanitized: true };
}

function sourceForSanitizedId(
  id: string,
  options: GalleryLutOption[]
): string | null {
  if (id === GALLERY_LUT_ORIGINAL_ID) return null;
  const opt = options.find((o) => o.id === id);
  if (opt?.source && opt.source.length > 0) return opt.source;
  return null;
}

export function resolvePublicVideoGalleryLutDisplayState(params: {
  creativeLutOn: boolean;
  lutPreviewEnabled: boolean;
  selectedLutId: string;
  options: GalleryLutOption[];
  ownerDefaultLutId?: string | null;
}): ResolvedPublicVideoGalleryLutDisplayState {
  const enabledByOwner = params.creativeLutOn;

  if (!enabledByOwner) {
    return {
      enabledByOwner,
      previewEnabled: false,
      sanitizedSelectedLutId: GALLERY_LUT_ORIGINAL_ID,
      resolvedLutSource: null,
      shouldApplyLut: false,
      fallbackReason: "owner_disabled",
      selectionWasSanitized: false,
    };
  }

  if (!params.lutPreviewEnabled) {
    return {
      enabledByOwner,
      previewEnabled: false,
      sanitizedSelectedLutId: params.selectedLutId,
      resolvedLutSource: null,
      shouldApplyLut: false,
      fallbackReason: "viewer_disabled",
      selectionWasSanitized: false,
    };
  }

  const { id: sanitized, wasSanitized } = sanitizeVideoGalleryLutSelection(
    params.selectedLutId,
    params.options,
    params.ownerDefaultLutId
  );

  if (sanitized === GALLERY_LUT_ORIGINAL_ID) {
    return {
      enabledByOwner,
      previewEnabled: true,
      sanitizedSelectedLutId: sanitized,
      resolvedLutSource: null,
      shouldApplyLut: false,
      fallbackReason: wasSanitized ? "invalid_selection" : "original_selected",
      selectionWasSanitized: wasSanitized,
    };
  }

  const src = sourceForSanitizedId(sanitized, params.options);
  if (!src) {
    return {
      enabledByOwner,
      previewEnabled: true,
      sanitizedSelectedLutId: sanitized,
      resolvedLutSource: null,
      shouldApplyLut: false,
      fallbackReason: "missing_source",
      selectionWasSanitized: wasSanitized,
    };
  }

  return {
    enabledByOwner,
    previewEnabled: true,
    sanitizedSelectedLutId: sanitized,
    resolvedLutSource: src,
    shouldApplyLut: true,
    fallbackReason: wasSanitized ? "invalid_selection" : null,
    selectionWasSanitized: wasSanitized,
  };
}
