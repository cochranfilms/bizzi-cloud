/**
 * Server-side Creator RAW finalization: locked session must target a real RAW drive
 * and pass ffprobe-backed codec policy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  assertCreatorRawFinalizeOrAudit,
  isLockedCreatorRawPayload,
} from "@/lib/upload-finalize-guards";
import { inspectMediaObjectKey } from "@/lib/creator-raw-media-probe";
import { deleteObject } from "@/lib/b2";

vi.mock("@/lib/activity-log", () => ({
  logActivityEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/creator-raw-media-probe", () => ({
  inspectMediaObjectKey: vi.fn(),
}));

vi.mock("@/lib/b2", () => ({
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

const mockInspect = vi.mocked(inspectMediaObjectKey);
const mockDelete = vi.mocked(deleteObject);

function mockSnap(exists: boolean, isRaw: boolean): DocumentSnapshot {
  return {
    exists,
    data: () => (exists ? { is_creator_raw: isRaw, name: isRaw ? "RAW" : "Storage" } : undefined),
  } as DocumentSnapshot;
}

describe("isLockedCreatorRawPayload", () => {
  it("detects locked creator_raw_video", () => {
    expect(
      isLockedCreatorRawPayload({
        uploadIntent: "creator_raw_video",
        lockedDestination: true,
      })
    ).toBe(true);
    expect(
      isLockedCreatorRawPayload({
        destinationMode: "creator_raw",
        lockedDestination: "true",
      })
    ).toBe(true);
  });

  it("false when not locked", () => {
    expect(
      isLockedCreatorRawPayload({ uploadIntent: "creator_raw_video", lockedDestination: false })
    ).toBe(false);
  });
});

describe("assertCreatorRawFinalizeOrAudit", () => {
  beforeEach(() => {
    mockInspect.mockReset();
    mockDelete.mockClear();
  });

  it("skips ffprobe when skipMediaProbe (multipart init)", async () => {
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "clip.mp4",
      objectKey: "backups/u1/raw1/clip.mp4",
      skipMediaProbe: true,
    });
    expect(r).toEqual({ ok: true });
    expect(mockInspect).not.toHaveBeenCalled();
  });

  it("allows RAW drive when ffprobe reports ProRes in .mp4", async () => {
    mockInspect.mockResolvedValue({
      detectedContainer: "mov,mp4,m4a,3gp,3g2,mj2",
      detectedVideoCodec: "prores",
      detectedCodecLongName: null,
      detectedCodecTag: "apch",
      detectedPixelFormat: "yuv422p10le",
      detectedBitDepth: 10,
      detectedWidth: 1920,
      detectedHeight: 1080,
      detectedFrameRate: 24,
      hasVideoStream: true,
    });
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "mezzanine.mp4",
      objectKey: "backups/u1/raw1/mezzanine.mp4",
      contentType: "video/mp4",
    });
    expect(r).toEqual({ ok: true });
    expect(mockInspect).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("allows .r3d when ffprobe fails (trusted extension path)", async () => {
    mockInspect.mockResolvedValue({
      detectedContainer: null,
      detectedVideoCodec: null,
      detectedCodecLongName: null,
      detectedCodecTag: null,
      detectedPixelFormat: null,
      detectedBitDepth: null,
      detectedWidth: null,
      detectedHeight: null,
      detectedFrameRate: null,
      hasVideoStream: false,
      probeError: "ffprobe_failed",
    });
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "footage/A001.R3D",
      objectKey: "backups/u1/raw1/A001.R3D",
    });
    expect(r).toEqual({ ok: true });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("rejects H.264 in .mp4 and deletes object", async () => {
    mockInspect.mockResolvedValue({
      detectedContainer: "mov,mp4,m4a,3gp,3g2,mj2",
      detectedVideoCodec: "h264",
      detectedCodecLongName: null,
      detectedCodecTag: "avc1",
      detectedPixelFormat: "yuv420p",
      detectedBitDepth: 8,
      detectedWidth: 1920,
      detectedHeight: 1080,
      detectedFrameRate: 30,
      hasVideoStream: true,
    });
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "phone.mp4",
      objectKey: "backups/u1/raw1/phone.mp4",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
    expect(mockDelete).toHaveBeenCalledWith("backups/u1/raw1/phone.mp4");
  });

  it("rejects disallowed non-video leaf for Creator RAW without probing", async () => {
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      relativePath: "notes.txt",
      objectKey: "backups/u1/raw1/notes.txt",
    });
    expect(r.ok).toBe(false);
    expect(mockInspect).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledWith("backups/u1/raw1/notes.txt");
  });

  it("rejects when locked intent but Storage drive", async () => {
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "stor1",
      driveSnap: mockSnap(true, false),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "clip.mp4",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(400);
  });
});
