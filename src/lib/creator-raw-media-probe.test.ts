import { describe, it, expect } from "vitest";
import { inspectMediaFromFfprobeJson, parseFfprobeVideoStream } from "@/lib/creator-raw-media-probe";
import { classifyCreatorRawMedia } from "@/lib/creator-raw-media-validator";

describe("parseFfprobeVideoStream", () => {
  it("uses the largest allowlisted stream when an H.264 proxy precedes ProRes", () => {
    const json = {
      format: { format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          codec_tag_string: "avc1",
          width: 960,
          height: 540,
        },
        {
          codec_type: "video",
          codec_name: "prores",
          codec_tag_string: "apch",
          width: 3840,
          height: 2160,
          pix_fmt: "yuv422p10le",
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedVideoCodec).toBe("prores");
    expect(inspected.detectedCodecTag).toBe("apch");
    const v = classifyCreatorRawMedia(inspected, "camera.MP4", "video/mp4");
    expect(v.allowed).toBe(true);
  });

  it("skips attached_pic video tracks when choosing streams", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mjpeg",
          width: 320,
          height: 180,
          disposition: { attached_pic: 1 },
        },
        {
          codec_type: "video",
          codec_name: "hevc",
          codec_tag_string: "hvc1",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedVideoCodec).toBe("hevc");
  });

  it("classifies via inspectMediaFromFfprobeJson helper", () => {
    const inspected = inspectMediaFromFfprobeJson({
      format: { format_name: "mp4" },
      streams: [{ codec_type: "video", codec_name: "h264", width: 1920, height: 1080 }],
    });
    expect(inspected.detectedVideoCodec).toBe("h264");
  });
});
