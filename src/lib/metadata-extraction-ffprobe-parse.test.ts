import { describe, it, expect } from "vitest";
import { ffprobeJsonToBackupUpdates } from "@/lib/metadata-extraction-ffprobe-parse";

describe("ffprobeJsonToBackupUpdates", () => {
  it("maps video stream, duration, audio flag, and creation tag like extract-metadata parity", () => {
    const root = {
      format: {
        duration: "123.45",
        tags: { creation_time: "2020-05-01T12:00:00.000000Z" },
      },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          width: 1920,
          height: 1080,
          r_frame_rate: "30000/1001",
        },
        { codec_type: "audio", codec_name: "aac", channels: 2 },
      ],
    };
    const u = ffprobeJsonToBackupUpdates(root, "clip.mov");
    expect(u.media_type).toBe("video");
    expect(u.container_format).toBe("mov");
    expect(u.content_type).toBe("video/quicktime");
    expect(u.duration_sec).toBeCloseTo(123.45, 4);
    expect(u.resolution_w).toBe(1920);
    expect(u.resolution_h).toBe(1080);
    expect(u.frame_rate).toBeCloseTo(30000 / 1001, 5);
    expect(u.video_codec).toBe("h264");
    expect(u.has_audio).toBe(true);
    expect(u.audio_channels).toBe(2);
    expect(u.created_at).toMatch(/^2020-05-01T12:00:00\.000Z$/);
  });

  it("treats audio-only as non-video updates without container_format", () => {
    const root = {
      format: { duration: "10" },
      streams: [{ codec_type: "audio", codec_name: "aac", channels: 1 }],
    };
    const u = ffprobeJsonToBackupUpdates(root, "song.m4a");
    expect(u.media_type).toBeUndefined();
    expect(u.has_audio).toBe(true);
    expect(u.duration_sec).toBe(10);
  });
});
