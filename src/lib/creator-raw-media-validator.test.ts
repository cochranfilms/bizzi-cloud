/**
 * Codec policy for Creator RAW: extension and MIME are not authoritative.
 */
import { describe, it, expect } from "vitest";
import { classifyCreatorRawMedia } from "@/lib/creator-raw-media-validator";
import type { InspectedMediaStreams } from "@/lib/creator-raw-media-types";

function vbase(overrides: Partial<InspectedMediaStreams> = {}): InspectedMediaStreams {
  return {
    detectedContainer: "mov,mp4,m4a,3gp,3g2,mj2",
    detectedVideoCodec: null,
    detectedCodecLongName: null,
    detectedCodecTag: null,
    detectedPixelFormat: null,
    detectedBitDepth: null,
    detectedWidth: 1920,
    detectedHeight: 1080,
    detectedFrameRate: 24,
    hasVideoStream: true,
    ...overrides,
  };
}

describe("classifyCreatorRawMedia", () => {
  it("rejects .mp4 leaf when codec is H.264", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "h264", detectedCodecTag: "avc1" }),
      "phone.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("rejects .mp4 leaf when codec is HEVC without XAVC camera branding", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "hevc", detectedCodecTag: "hvc1" }),
      "clip.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toMatch(/delivery/);
  });

  it("allows .mp4 when HEVC is XAVC-branded (Sony camera-original packaging)", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "hevc",
        detectedCodecTag: "hvc1",
        detectedCodecLongName:
          "H.265 / HEVC (MPEG-H Part 2) | Sony | XAVC HS 4:2:2 10bit | a6000",
      }),
      "C0001.MP4",
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_hevc_xavc_mp4");
  });

  it("allows .mp4 when H.264 is XAVC-S/I branded (Sony ILCE-style packaging)", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName:
          "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 | Sony | AVC Coding | isom | XAVC | mp42",
      }),
      "C0260.MP4",
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_h264_xavc_mp4");
  });

  it("rejects XAVC-branded H.264 when container leaf is not .mp4/.m4v", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName: "XAVC | Sony",
      }),
      "clip.mov",
      "video/quicktime"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("rejects XAVC-branded HEVC when container leaf is not .mp4/.m4v", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "hevc",
        detectedCodecTag: "hvc1",
        detectedCodecLongName: "XAVC HS | Sony",
      }),
      "export.mov",
      "video/quicktime"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("rejects generic HEVC .mp4 even with Sony in metadata if XAVC is absent", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "hevc",
        detectedCodecTag: "hvc1",
        detectedCodecLongName: "Sony ILCE-7M4",
      }),
      "clip.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toMatch(/delivery/);
  });

  it("rejects generic H.264 .mp4 even with Sony in metadata if XAVC is absent", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName: "H.264 | Sony ILCE-7SM3",
      }),
      "clip.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toMatch(/delivery/);
  });

  it("rejects .mov leaf when codec is H.264", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "h264" }),
      "export.mov",
      "video/quicktime"
    );
    expect(r.allowed).toBe(false);
  });

  it("allows .mov when codec is ProRes (mezzanine)", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "prores", detectedCodecTag: "apch" }),
      "hq.mov",
      "video/quicktime"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_tag");
  });

  it("allows ProRes-in-MP4 when ffprobe reports generic mpeg4 codec but ProRes fourcc", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "mpeg4", detectedCodecTag: "apch" }),
      "JB22061.MP4",
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_tag");
  });

  it("allows mpeg4 when codec_long_name identifies Apple ProRes (no fourcc)", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "mpeg4",
        detectedCodecTag: null,
        detectedCodecLongName: "Apple ProRes 422 HQ",
      }),
      "JB22061.MP4",
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_codec_long_name");
  });

  it("does not allow H.264 even if codec_long_name mentions ProRes (spoof)", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName: "Apple ProRes 422 HQ",
      }),
      "fake.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("does not allow H.264 when hint blob includes encoder claiming ProRes", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName: "H.264 | Apple ProRes 422",
      }),
      "fake.mp4",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("allows ProRes RAW fourcc aprn when codec_name is not on the codec allowlist (tag path)", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "huffyuv", detectedCodecTag: "aprn" }),
      "raw.mov",
      "video/quicktime"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_tag");
  });

  it("allows ProRes 422 HQ fourcc apch when codec_name is unknown", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "unknown", detectedCodecTag: "apch" }),
      "JB22061.MP4",
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_tag");
  });

  it("allows ProRes via fourcc when ffprobe leaves codec_name empty", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: null, detectedCodecTag: "apcn" }),
      "take.MP4",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_tag");
  });

  it("allows .braw when probe succeeded with video and codec is not a blocked delivery codec", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "v_braw" }),
      "take.braw",
      "application/octet-stream"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("braw_verified");
  });

  it("fails closed on probe error for non-excepted extensions", () => {
    const r = classifyCreatorRawMedia(
      { ...vbase({ hasVideoStream: false }), probeError: "exec failed" },
      "mystery.mp4",
      null
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("probe_error");
  });

  it("allows .r3d when ffprobe reports probe_error (REDCODE not parsed)", () => {
    const r = classifyCreatorRawMedia(
      { ...vbase({ hasVideoStream: false }), probeError: "exec failed" },
      "A003_C027.R3D",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("trusted_raw_extension");
  });

  it("allows .r3d when ffprobe finds no video stream", () => {
    const r = classifyCreatorRawMedia(
      { ...vbase(), hasVideoStream: false, detectedVideoCodec: null, detectedCodecTag: null },
      "clip.r3d",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("trusted_raw_extension");
  });

  it("allows .r3d when probe succeeds but codec and fourcc are absent", () => {
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: null,
        detectedCodecTag: null,
        detectedCodecLongName: null,
      }),
      "take.r3d",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("trusted_raw_extension");
  });

  it("allows .mxf when ffprobe reports probe_error", () => {
    const r = classifyCreatorRawMedia(
      { ...vbase({ hasVideoStream: false }), probeError: "exec failed" },
      "clip.MXF",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("trusted_raw_extension");
  });

  it("allows .mxf when codec_name is not on the allowlist but is not a blocked delivery codec", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "ffvhuff", detectedCodecTag: null }),
      "take.mxf",
      null
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("mxf_verified");
  });

  it("rejects H.264 in .mxf", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "h264", detectedCodecTag: "avc1" }),
      "delivery.mxf",
      null
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("fails closed when there is no video stream", () => {
    const r = classifyCreatorRawMedia(
      {
        ...vbase(),
        hasVideoStream: false,
        detectedVideoCodec: null,
      },
      "empty.mp4",
      null
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("no_video_stream");
  });

  it("rejects when extension looks like cinema RAW but codec is delivery", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "h264" }),
      "fake.r3d",
      "video/mp4"
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("delivery_codec");
  });

  it("rejects unapproved codec even with .r3d extension (fail closed)", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "ffvhuff" }),
      "clip.r3d",
      null
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("raw_extension_unverified");
  });

  it("allows odd extension when codec is on allowlist (metadata wins)", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "prores", detectedCodecTag: "apcn" }),
      "mezz.data",
      "application/octet-stream"
    );
    expect(r.allowed).toBe(true);
  });

  it("fails closed on unknown codec", () => {
    const r = classifyCreatorRawMedia(
      vbase({ detectedVideoCodec: "unknown_xyz" }),
      "file.mp4",
      null
    );
    expect(r.allowed).toBe(false);
    expect(r.code).toBe("codec_not_allowed");
  });
});
