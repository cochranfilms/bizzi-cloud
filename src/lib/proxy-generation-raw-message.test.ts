import { describe, expect, it } from "vitest";
import { summarizeRawDecodeFailureForUser } from "@/lib/proxy-generation";

describe("summarizeRawDecodeFailureForUser", () => {
  it("detects brxq in stderr and tells operator to set FFMPEG_BRAW_PATH when not using BRAW binary", () => {
    const stderr = `[mov @ x] Could not find codec parameters for stream 0 (Video: none (brxq / 0x71787262), none, 12336x8064)
Decoding requested, but no decoder found for: none`;
    const msg = summarizeRawDecodeFailureForUser(stderr, "jwflix018_03260731_C056.braw", false);
    expect(msg).toContain("FFMPEG_BRAW_PATH");
    expect(msg).toContain("Blackmagic RAW");
  });

  it("when BRAW fork is configured, message points to logs", () => {
    const stderr = "(brxq / 0x71787262)";
    const msg = summarizeRawDecodeFailureForUser(stderr, "clip.braw", true);
    expect(msg).toContain("configured BRAW FFmpeg");
  });
});
