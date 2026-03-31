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

  it("prefers ProRes track when ffprobe reports mpeg4 + apch (common in MP4 mezzanine)", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_tag_string: "apch",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedVideoCodec).toBe("mpeg4");
    expect(inspected.detectedCodecTag).toBe("apch");
    expect(classifyCreatorRawMedia(inspected, "take.MP4", "video/mp4").allowed).toBe(true);
  });

  it("allows ProRes when only codec_tag hex is present (empty codec_tag_string)", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_tag_string: "",
          codec_tag: "0x61706368",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecTag).toBe("apch");
    expect(classifyCreatorRawMedia(inspected, "JB22061.MP4", "video/mp4").allowed).toBe(true);
  });

  it("allows mpeg4 when codec_long_name is Apple ProRes and fourcc is absent", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_long_name: "Apple ProRes 422 (HQ)",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecLongName).toContain("Apple ProRes 422 (HQ)");
    expect(inspected.detectedCodecTag).toBeNull();
    expect(classifyCreatorRawMedia(inspected, "JB22061.MP4", "video/mp4").allowed).toBe(true);
  });

  it("allows mpeg4 when ProRes appears only in stream tags.encoder", () => {
    const json = {
      format: { format_name: "mp4", tags: { major_brand: "isom", minor_version: "512" } },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_long_name: "MPEG-4 part 2",
          tags: { encoder: "Apple ProRes 422 (HQ)", handler_name: "VideoHandler" },
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecLongName).toMatch(/Apple ProRes/i);
    expect(classifyCreatorRawMedia(inspected, "JB22061.MP4", "video/mp4").allowed).toBe(true);
  });

  it("allows mpeg4 when ProRes appears only in format.tags.encoder", () => {
    const json = {
      format: {
        format_name: "mp4",
        tags: { encoder: "Apple ProRes 422", compatible_brands: "isomiso2" },
      },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_long_name: "unknown",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecLongName).toMatch(/Apple ProRes/i);
    expect(classifyCreatorRawMedia(inspected, "JB22061.MP4", "video/mp4").allowed).toBe(true);
  });

  it("derives avc1 from LE hex when codec_tag_string is missing (delivery still rejected)", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          codec_tag: "0x31637661",
          width: 1920,
          height: 1080,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecTag).toBe("avc1");
    expect(classifyCreatorRawMedia(inspected, "clip.mp4", "video/mp4").allowed).toBe(false);
  });

  it("uses coded_width/coded_height when display width/height are unknown (-1)", () => {
    const json = {
      format: { format_name: "mp4" },
      streams: [
        {
          codec_type: "video",
          codec_name: "mpeg4",
          codec_tag_string: "apch",
          width: -1,
          height: -1,
          coded_width: 3840,
          coded_height: 2160,
        },
        {
          codec_type: "video",
          codec_name: "h264",
          codec_tag_string: "avc1",
          width: 960,
          height: 540,
        },
      ],
    };
    const inspected = parseFfprobeVideoStream(json);
    expect(inspected.detectedCodecTag).toBe("apch");
    expect(inspected.detectedWidth).toBe(3840);
    expect(inspected.detectedHeight).toBe(2160);
    expect(classifyCreatorRawMedia(inspected, "JB22061.MP4", "video/mp4").allowed).toBe(true);
  });
});
