import { describe, it, expect } from "vitest";
import {
  VIDEO_POSTER_HEIGHT,
  VIDEO_POSTER_JPEG_Q,
  VIDEO_POSTER_WIDTH,
  videoPosterFrameFfmpegArgsFileInput,
  videoPosterFrameFfmpegArgsPipeInput,
  videoPosterScalePadFilter,
} from "@/lib/video-poster-frame";

describe("video-poster-frame", () => {
  it("matches grid dimensions used by workers (sync scripts/video-poster-frame-worker.mjs)", () => {
    expect(VIDEO_POSTER_WIDTH).toBe(480);
    expect(VIDEO_POSTER_HEIGHT).toBe(270);
    expect(VIDEO_POSTER_JPEG_Q).toBe(3);
    expect(videoPosterScalePadFilter()).toContain("480");
    expect(videoPosterScalePadFilter()).toContain("270");
  });

  it("builds pipe and file argv lists with shared geometry", () => {
    const pipe = videoPosterFrameFfmpegArgsPipeInput("https://example.com/x", 0.5);
    expect(pipe[0]).toBe("-y");
    expect(pipe).toContain("pipe:1");
    expect(pipe).toContain(videoPosterScalePadFilter());

    const file = videoPosterFrameFfmpegArgsFileInput("/tmp/a.mp4", 0, "/tmp/out.jpg");
    expect(file).toContain("/tmp/out.jpg");
    expect(file).toContain(videoPosterScalePadFilter());
  });
});
