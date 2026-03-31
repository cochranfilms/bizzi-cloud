/**
 * Server-side Creator RAW finalization: locked session must target a real RAW drive
 * and allowed file types.
 */
import { describe, it, expect, vi } from "vitest";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  assertCreatorRawFinalizeOrAudit,
  isLockedCreatorRawPayload,
} from "@/lib/upload-finalize-guards";

vi.mock("@/lib/activity-log", () => ({
  logActivityEvent: vi.fn().mockResolvedValue(undefined),
}));

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
  it("allows RAW drive with locked intent and mp4 leaf", async () => {
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      destinationMode: "creator_raw",
      relativePath: "clip.mp4",
    });
    expect(r).toEqual({ ok: true });
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

  it("rejects disallowed extension for Creator RAW", async () => {
    const r = await assertCreatorRawFinalizeOrAudit({
      uid: "u1",
      driveId: "raw1",
      driveSnap: mockSnap(true, true),
      uploadIntent: "creator_raw_video",
      lockedDestination: true,
      relativePath: "notes.txt",
    });
    expect(r.ok).toBe(false);
  });
});
