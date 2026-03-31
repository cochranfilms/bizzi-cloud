import { describe, expect, it } from "vitest";
import {
  CINEMA_RAW_VIDEO_EXTENSIONS,
  isRawVideoFile,
  RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE,
  requiresProxyPreview,
  shouldUseVideoThumbnailPipeline,
} from "@/lib/raw-video";

describe("raw-video", () => {
  it("treats cinema extensions as RAW video", () => {
    for (const ext of CINEMA_RAW_VIDEO_EXTENSIONS) {
      expect(isRawVideoFile(`clip.${ext}`)).toBe(true);
      expect(isRawVideoFile(`sub/clip.${ext}`)).toBe(true);
      expect(requiresProxyPreview(`x.${ext}`)).toBe(true);
    }
  });

  it("does not treat plain .dng as RAW video (still workflow)", () => {
    expect(isRawVideoFile("still.dng")).toBe(false);
    expect(requiresProxyPreview("still.dng")).toBe(false);
  });

  it("includes cinema RAW in video thumbnail pipeline", () => {
    expect(shouldUseVideoThumbnailPipeline("take.braw")).toBe(true);
    expect(shouldUseVideoThumbnailPipeline("clip.mp4")).toBe(true);
    expect(shouldUseVideoThumbnailPipeline("photo.cr2")).toBe(false);
  });

  it("exposes stable API error code for still-thumbnail contract", () => {
    expect(RAW_VIDEO_USE_VIDEO_THUMBNAIL_CODE).toBe("raw_video_use_video_thumbnail");
  });
});
