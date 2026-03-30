/**
 * Client-side helpers for gallery creative LUT selection (preview only).
 */

import { BIZZI_TEST_INVERT_LUT_ID } from "@/lib/creative-lut/lut-debug";

export const GALLERY_LUT_ORIGINAL_ID = "__bizzi_original__";

export type GalleryLutOption = { id: string; name: string; source: string };

export function buildGalleryLUTOptions(
  library?: Array<{ id: string; name?: string; signed_url?: string | null }>,
  includeBuiltinSony = false,
  password?: string
): GalleryLutOption[] {
  const opts: GalleryLutOption[] = [
    { id: GALLERY_LUT_ORIGINAL_ID, name: "Original", source: "" },
  ];
  if (includeBuiltinSony) {
    opts.push({ id: "sony_rec709", name: "Sony Rec 709", source: "sony_rec709" });
  }
  if (library) {
    for (const e of library) {
      if (e.signed_url) {
        const source = password
          ? e.signed_url.includes("?")
            ? `${e.signed_url}&password=${encodeURIComponent(password)}`
            : `${e.signed_url}?password=${encodeURIComponent(password)}`
          : e.signed_url;
        opts.push({ id: e.id, name: e.name ?? "Custom LUT", source });
      }
    }
  }
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage?.getItem("bizziDebugLut") === "1") {
        opts.push({
          id: BIZZI_TEST_INVERT_LUT_ID,
          name: "Debug: invert (pipeline test)",
          source: BIZZI_TEST_INVERT_LUT_ID,
        });
      }
    } catch {
      /* ignore */
    }
  }
  return opts;
}

export function getLutSourceFromSelection(
  selectedId: string | null,
  options: GalleryLutOption[],
  fallback: string | null
): string | null {
  if (!selectedId || selectedId === GALLERY_LUT_ORIGINAL_ID) return null;
  const opt = options.find((o) => o.id === selectedId);
  if (opt?.source) return opt.source;
  return fallback;
}

/** Resolve client preview LUT source; null means show original (no LUT). */
export function resolveGalleryClientLutSource(params: {
  lutEnabled: boolean;
  lutPreviewEnabled: boolean;
  selectedLutId: string | null;
  options: GalleryLutOption[];
  ownerDefaultSource: string | null;
}): string | null {
  const { lutEnabled, lutPreviewEnabled, selectedLutId, options, ownerDefaultSource } = params;
  if (!lutEnabled || !lutPreviewEnabled) return null;
  return getLutSourceFromSelection(selectedLutId, options, ownerDefaultSource);
}

/** Firestore / JSON often uses string or numeric booleans; keep GET/PATCH and client in sync. */
export function coerceFirestoreBoolean(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const l = v.trim().toLowerCase();
    if (l === "true") return true;
    if (l === "false") return false;
  }
  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }
  return undefined;
}

/** Matches server GET /view: creative config wins, then legacy `lut.enabled`. */
export function resolveGalleryCreativeLutEnabledFromPayload(gallery: {
  creative_lut_config?: { enabled?: unknown } | null;
  lut?: { enabled?: unknown } | null;
}): boolean {
  return (
    coerceFirestoreBoolean(gallery.creative_lut_config?.enabled) ??
    coerceFirestoreBoolean(gallery.lut?.enabled) ??
    false
  );
}
