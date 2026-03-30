/** Unit coverage for video public-gallery LUT resolution. E2E (Playwright): hero/grid/modal, stream swap — add separately. */
import { describe, expect, it } from "vitest";
import {
  resolvePublicVideoGalleryLutDisplayState,
  sanitizeVideoGalleryLutSelection,
} from "./resolve-public-video-gallery-lut";
import { GALLERY_LUT_ORIGINAL_ID } from "./gallery-client-lut";

const baseOptions = [
  { id: GALLERY_LUT_ORIGINAL_ID, name: "Original", source: "" },
  { id: "sony_rec709", name: "Sony Rec 709", source: "sony_rec709" },
  { id: "uuid-custom", name: "Custom", source: "/api/galleries/x/lut-file?entry_id=uuid-custom&lut_format=cube" },
];

describe("sanitizeVideoGalleryLutSelection", () => {
  it("keeps valid id", () => {
    const r = sanitizeVideoGalleryLutSelection("sony_rec709", baseOptions, "uuid-custom");
    expect(r).toEqual({ id: "sony_rec709", wasSanitized: false });
  });

  it("clamps to owner default when selection missing", () => {
    const r = sanitizeVideoGalleryLutSelection("stale-id", baseOptions, "uuid-custom");
    expect(r).toEqual({ id: "uuid-custom", wasSanitized: true });
  });

  it("clamps to sony when owner default invalid", () => {
    const r = sanitizeVideoGalleryLutSelection("stale-id", baseOptions, "bad");
    expect(r).toEqual({ id: "sony_rec709", wasSanitized: true });
  });

  it("falls back to original when only original in list", () => {
    const opts = [{ id: GALLERY_LUT_ORIGINAL_ID, name: "Original", source: "" }];
    const r = sanitizeVideoGalleryLutSelection("stale", opts, null);
    expect(r).toEqual({ id: GALLERY_LUT_ORIGINAL_ID, wasSanitized: true });
  });
});

describe("resolvePublicVideoGalleryLutDisplayState", () => {
  it("owner_disabled when creative off", () => {
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: false,
      lutPreviewEnabled: true,
      selectedLutId: "sony_rec709",
      options: baseOptions,
      ownerDefaultLutId: "sony_rec709",
    });
    expect(s.shouldApplyLut).toBe(false);
    expect(s.fallbackReason).toBe("owner_disabled");
  });

  it("viewer_disabled when preview off", () => {
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: false,
      selectedLutId: "sony_rec709",
      options: baseOptions,
      ownerDefaultLutId: "sony_rec709",
    });
    expect(s.shouldApplyLut).toBe(false);
    expect(s.fallbackReason).toBe("viewer_disabled");
  });

  it("original_selected for original preset", () => {
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: true,
      selectedLutId: GALLERY_LUT_ORIGINAL_ID,
      options: baseOptions,
      ownerDefaultLutId: "sony_rec709",
    });
    expect(s.shouldApplyLut).toBe(false);
    expect(s.fallbackReason).toBe("original_selected");
    expect(s.resolvedLutSource).toBeNull();
  });

  it("applies Sony with deterministic source from options only", () => {
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: true,
      selectedLutId: "sony_rec709",
      options: baseOptions,
      ownerDefaultLutId: "uuid-custom",
    });
    expect(s.shouldApplyLut).toBe(true);
    expect(s.resolvedLutSource).toBe("sony_rec709");
    expect(s.fallbackReason).toBeNull();
  });

  it("applies custom from options; no URL fallback for stale id beyond clamp", () => {
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: true,
      selectedLutId: "removed-lut-id",
      options: baseOptions,
      ownerDefaultLutId: "uuid-custom",
    });
    expect(s.sanitizedSelectedLutId).toBe("uuid-custom");
    expect(s.shouldApplyLut).toBe(true);
    expect(s.resolvedLutSource).toBe(
      "/api/galleries/x/lut-file?entry_id=uuid-custom&lut_format=cube"
    );
    expect(s.fallbackReason).toBe("invalid_selection");
  });

  it("missing_source when option has empty source", () => {
    const opts = [
      { id: GALLERY_LUT_ORIGINAL_ID, name: "Original", source: "" },
      { id: "bad", name: "Bad", source: "" },
    ];
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: true,
      selectedLutId: "bad",
      options: opts,
      ownerDefaultLutId: null,
    });
    expect(s.shouldApplyLut).toBe(false);
    expect(s.fallbackReason).toBe("missing_source");
  });

  it("password suffix is irrelevant to resolver (parent builds options)", () => {
    const withPassword = baseOptions.map((o) =>
      o.id === "uuid-custom"
        ? {
            ...o,
            source: `${o.source}?password=secret`,
          }
        : o
    );
    const s = resolvePublicVideoGalleryLutDisplayState({
      creativeLutOn: true,
      lutPreviewEnabled: true,
      selectedLutId: "uuid-custom",
      options: withPassword,
      ownerDefaultLutId: "sony_rec709",
    });
    expect(s.resolvedLutSource).toContain("password=secret");
  });
});
