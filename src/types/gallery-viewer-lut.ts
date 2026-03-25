/**
 * Gallery-level LUT preview preferences for the public viewer.
 * Intended for persistence in the database and return on GET /view (or a dedicated endpoint).
 */

export type GalleryViewerLutPreferences = {
  selectedLutId: string;
  lutPreviewEnabled: boolean;
  gradeMixPercent: number;
};

export type GalleryViewerLutPreferencesPersisted = GalleryViewerLutPreferences;
