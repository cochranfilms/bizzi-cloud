/**
 * Legacy helper: resolved server “active” LUT for asset grids.
 * Owner upload grids stay neutral (no global LUT); proofing uses
 * `resolveProofingGridLutMirror` in `gallery-viewer-lut-state` (DB + continuity) instead.
 */

import {
  buildGalleryLUTOptions,
  GALLERY_LUT_ORIGINAL_ID,
  resolveGalleryClientLutSource,
} from "@/lib/gallery-client-lut";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import type { GalleryViewerLutPreferences } from "@/types/gallery-viewer-lut";

export type ViewGalleryLike = {
  gallery_type?: string;
  media_mode?: string;
  source_format?: string | null;
  lut?: { enabled?: boolean; lut_source?: string | null; storage_url?: string | null } | null;
  creative_lut_config?: { enabled?: boolean; selected_lut_id?: string | null } | null;
  creative_lut_library?: Array<{ id: string; name?: string; signed_url?: string | null }>;
  /** When persisted viewer prefs ship on GET /view, proofing + viewer resolve them here. */
  viewer_lut_preferences?: GalleryViewerLutPreferences | null;
};

export function computeGalleryAssetGridLutPreview(viewGallery: ViewGalleryLike | null): {
  /** Pass to GalleryAssetThumbnail when non-null and LUT workflow is RAW photo */
  previewLutSource: string | null;
  /** When true, RAW image tiles may apply previewLutSource */
  lutWorkflowActive: boolean;
} {
  if (!viewGallery) {
    return { previewLutSource: null, lutWorkflowActive: false };
  }
  const isVideo = viewGallery.gallery_type === "video";
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: viewGallery.media_mode ?? null,
    source_format: viewGallery.source_format ?? null,
  });
  const lutWorkflowActive = !isVideo && mediaMode === "raw";
  const lutOptions = buildGalleryLUTOptions(
    viewGallery.creative_lut_library,
    false,
    undefined
  );
  const lutOn = !!viewGallery.lut?.enabled;
  const cfg = viewGallery.creative_lut_config;
  const configPreview =
    cfg != null && typeof cfg === "object" && "enabled" in cfg && typeof cfg.enabled === "boolean"
      ? cfg.enabled
      : null;
  const lutPreviewEnabled = lutWorkflowActive && (configPreview !== null ? configPreview : lutOn);
  const defaultSelectedId =
    cfg?.selected_lut_id && lutOptions.some((o) => o.id === cfg.selected_lut_id)
      ? cfg.selected_lut_id
      : GALLERY_LUT_ORIGINAL_ID;
  const previewLutSource = resolveGalleryClientLutSource({
    lutEnabled: lutWorkflowActive && lutOn,
    lutPreviewEnabled,
    selectedLutId: defaultSelectedId,
    options: lutOptions,
    ownerDefaultSource: viewGallery.lut?.lut_source ?? viewGallery.lut?.storage_url ?? null,
  });
  return { previewLutSource, lutWorkflowActive };
}
