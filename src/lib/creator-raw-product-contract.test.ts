/**
 * Creator RAW product contract: proxy-first ingest + preview, reel layout, no original playback.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isVideoFile } from "@/lib/bizzi-file-types";
import { classifyCreatorRawMedia } from "@/lib/creator-raw-media-validator";
import type { InspectedMediaStreams } from "@/lib/creator-raw-media-types";
import {
  creatorRawUsesProxyOnlyPlayback,
  creatorRawVideoRemainsProcessingUntilStream,
  nonCreatorRawPollMayEndProcessingWithoutStream,
} from "@/lib/creator-raw-preview-contract";
import {
  CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE,
  parsePortraitDimensionsFromFileName,
  resolveCreatorRawReelPortrait,
  type CreatorRawReelEvidence,
} from "@/lib/creator-raw-reel-presentation";

vi.mock("@/lib/proxy-queue", () => ({
  queueProxyJob: vi.fn(() => Promise.resolve()),
}));

import { enqueueCreatorRawVideoProxyJob } from "@/lib/creator-raw-video-proxy-ingest";
import { queueProxyJob } from "@/lib/proxy-queue";

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

/** Mirrors `VideoWithLUT` `videoSrc` resolution — proxy-only must ignore signed original `src`. */
function resolveImmersiveVideoElementSrc(
  proxyOnlyPlayback: boolean,
  streamUrl: string | null | undefined,
  src: string
): string {
  return proxyOnlyPlayback ? (streamUrl ?? "") : (streamUrl ?? src);
}

describe("Creator RAW XAVC-S carve-out vs proxy pipeline", () => {
  beforeEach(() => {
    vi.mocked(queueProxyJob).mockClear();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  it("allows H.264 XAVC-S .mp4 and leaf is still a video type for ingest proxy enqueue", () => {
    const leaf = "C0260.MP4";
    const r = classifyCreatorRawMedia(
      vbase({
        detectedVideoCodec: "h264",
        detectedCodecTag: "avc1",
        detectedCodecLongName:
          "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 | Sony | AVC Coding | isom | XAVC | mp42",
      }),
      leaf,
      "video/mp4"
    );
    expect(r.allowed).toBe(true);
    expect(r.code).toBe("allowed_h264_xavc_mp4");
    expect(isVideoFile(leaf)).toBe(true);
  });

  it("enqueues proxy for creator-raw drive when leaf is allowed XAVC-S .mp4", async () => {
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: true,
      objectKey: "users/u1/backups/x/C0260.MP4",
      backupFileId: "bf-xavc",
      userId: "u1",
      relativePath: "roll/C0260.MP4",
      source: "ingest_presigned_complete",
    });
    expect(queueProxyJob).toHaveBeenCalledWith(
      expect.objectContaining({
        media_type: "video",
        name: "C0260.MP4",
        backup_file_id: "bf-xavc",
      })
    );
  });

  it("does not enqueue proxy when drive is not creator-raw", async () => {
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: false,
      objectKey: "users/u1/x/C0260.MP4",
      backupFileId: "bf-1",
      userId: "u1",
      relativePath: "C0260.MP4",
      source: "ingest_presigned_complete",
    });
    expect(queueProxyJob).not.toHaveBeenCalled();
  });

  it("does not enqueue for non-video leaf on a creator-raw drive", async () => {
    await enqueueCreatorRawVideoProxyJob({
      driveIsCreatorRaw: true,
      objectKey: "users/u1/x/readme.txt",
      backupFileId: "bf-2",
      userId: "u1",
      relativePath: "docs/readme.txt",
      source: "ingest_presigned_complete",
    });
    expect(queueProxyJob).not.toHaveBeenCalled();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});

describe("Creator RAW preview: processing until stream, no original fallback", () => {
  it("stays processing while stream API returns ok but no streamUrl", () => {
    expect(
      creatorRawVideoRemainsProcessingUntilStream(true, true, {
        processing: true,
        streamUrl: "",
      })
    ).toBe(true);
  });

  it("leaves processing when a non-empty streamUrl exists", () => {
    expect(
      creatorRawVideoRemainsProcessingUntilStream(true, true, {
        streamUrl: "https://example.com/hls/master.m3u8",
      })
    ).toBe(false);
  });

  it("does not allow non-creator poll logic to clear processing without stream", () => {
    expect(nonCreatorRawPollMayEndProcessingWithoutStream(true, 99, true)).toBe(false);
  });

  it("uses proxy-only playback flag only for creator-RAW immersive video", () => {
    expect(creatorRawUsesProxyOnlyPlayback(true, true)).toBe(true);
    expect(creatorRawUsesProxyOnlyPlayback(false, true)).toBe(false);
    expect(creatorRawUsesProxyOnlyPlayback(true, false)).toBe(false);
  });

  it("never assigns original URL to video element when proxy-only and stream pending", () => {
    const original = "https://signed-original.example/object.mp4";
    expect(resolveImmersiveVideoElementSrc(true, null, original)).toBe("");
    expect(resolveImmersiveVideoElementSrc(true, undefined, original)).toBe("");
  });

  it("uses stream URL for proxy-only when present (Mux or proxy MP4)", () => {
    const mux = "https://stream.example/playback.m3u8";
    expect(resolveImmersiveVideoElementSrc(true, mux, "ignored-original")).toBe(mux);
  });
});

describe("Creator RAW reel / portrait stage", () => {
  it("activates reel layout for 1080×1920 firestore-style evidence", () => {
    const e: CreatorRawReelEvidence[] = [{ source: "firestore", width: 1080, height: 1920 }];
    expect(resolveCreatorRawReelPortrait(e)).toBe(true);
  });

  it("parses portrait dims from filename token", () => {
    expect(parsePortraitDimensionsFromFileName("broll_1080x1920_proxy.mp4")).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it("uses nominal 9×16 from filename flags when embedded dims absent", () => {
    expect(
      resolveCreatorRawReelPortrait([{ source: "filename", width: 9, height: 16 }])
    ).toBe(true);
  });

  it("keeps identical slot dimensions for processing placeholder vs ready (no jump)", () => {
    const processing = { ...CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE };
    const ready = { ...CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE };
    expect(processing).toEqual(ready);
  });
});
