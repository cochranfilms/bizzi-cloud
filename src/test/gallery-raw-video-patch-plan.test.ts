import { describe, it, expect } from "vitest";
import { patchRequestsVideoRawToFinalConversion } from "@/lib/gallery-raw-video-final-archive";
import type { UpdateGalleryInput } from "@/types/gallery";

describe("patchRequestsVideoRawToFinalConversion", () => {
  const videoRawGallery = {
    gallery_type: "video",
    media_mode: "raw",
    source_format: "raw",
    title: "Test",
  };

  it("is true for video gallery RAW → Final when media_mode is patched", () => {
    const body: UpdateGalleryInput = { media_mode: "final", version: 1 };
    expect(patchRequestsVideoRawToFinalConversion(videoRawGallery, body)).toBe(true);
  });

  it("is true when source_format jpg is patched (legacy)", () => {
    const body: UpdateGalleryInput = { source_format: "jpg", version: 1 };
    expect(patchRequestsVideoRawToFinalConversion(videoRawGallery, body)).toBe(true);
  });

  it("is false for photo gallery", () => {
    const body: UpdateGalleryInput = { media_mode: "final", version: 1 };
    expect(
      patchRequestsVideoRawToFinalConversion(
        { ...videoRawGallery, gallery_type: "photo" },
        body
      )
    ).toBe(false);
  });

  it("is false when already Final", () => {
    const body: UpdateGalleryInput = { media_mode: "final", version: 1 };
    expect(
      patchRequestsVideoRawToFinalConversion(
        { ...videoRawGallery, media_mode: "final", source_format: "jpg" },
        body
      )
    ).toBe(false);
  });

  it("is false when profile fields not in body", () => {
    const body: UpdateGalleryInput = { title: "X", version: 1 };
    expect(patchRequestsVideoRawToFinalConversion(videoRawGallery, body)).toBe(false);
  });

  it("is false for invalid media_mode body (transaction will 400)", () => {
    const body = { media_mode: "broken", version: 1 } as unknown as UpdateGalleryInput;
    expect(patchRequestsVideoRawToFinalConversion(videoRawGallery, body)).toBe(false);
  });
});
