import { describe, it, expect } from "vitest";
import {
  verifyPartContinuityAndTotals,
  buildMigrationFinalizeKey,
  selectNextMigrationFileCandidate,
  planPartsRemainingForBudget,
} from "@/lib/migration-resumable-transfer";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";

function mockDoc(
  id: string,
  data: Record<string, unknown>
): QueryDocumentSnapshot {
  return { id, data: () => data } as unknown as QueryDocumentSnapshot;
}

describe("migration-resumable-transfer", () => {
  it("buildMigrationFinalizeKey is stable", () => {
    expect(buildMigrationFinalizeKey("j1", "f1", "s1")).toBe("j1:f1:s1");
  });

  it("verifyPartContinuityAndTotals accepts contiguous cover", () => {
    const partSize = 8 * 1024 * 1024;
    const parts = [
      { partNumber: 1, size_bytes: partSize, byte_start: 0, byte_end: partSize - 1 },
      {
        partNumber: 2,
        size_bytes: 1024,
        byte_start: partSize,
        byte_end: partSize + 1024 - 1,
      },
    ];
    const r = verifyPartContinuityAndTotals(parts, partSize + 1024);
    expect(r).toEqual({ ok: true });
  });

  it("verifyPartContinuityAndTotals rejects gap", () => {
    const r = verifyPartContinuityAndTotals(
      [
        { partNumber: 1, size_bytes: 5, byte_start: 0, byte_end: 4 },
        { partNumber: 3, size_bytes: 5, byte_start: 5, byte_end: 9 },
      ],
      10
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("part_gap");
  });

  it("verifyPartContinuityAndTotals rejects incomplete cover", () => {
    const r = verifyPartContinuityAndTotals(
      [{ partNumber: 1, size_bytes: 5, byte_start: 0, byte_end: 4 }],
      10
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("incomplete_cover");
  });

  it("planPartsRemainingForBudget respects max", () => {
    expect(planPartsRemainingForBudget({ partsAlreadyUploadedThisPass: 0, maxPerPass: 2 })).toBe(true);
    expect(planPartsRemainingForBudget({ partsAlreadyUploadedThisPass: 2, maxPerPass: 2 })).toBe(false);
  });

  it("selectNextMigrationFileCandidate prefers resumable over pending", () => {
    const pending = mockDoc("p1", {
      unsupported_reason: "supported",
      transfer_status: "pending",
      created_at: Timestamp.fromMillis(100),
    });
    const resumable = mockDoc("r1", {
      unsupported_reason: "supported",
      transfer_status: "in_progress",
      checkpoint_at: Timestamp.fromMillis(200),
    });
    const pick = selectNextMigrationFileCandidate({
      docs: [pending, resumable],
      fairnessLastFileId: null,
      fairnessConsecutive: 0,
      maxConsecutive: 4,
    });
    expect(pick?.id).toBe("r1");
  });

  it("selectNextMigrationFileCandidate fairness yields pending after consecutive cap", () => {
    const pending = mockDoc("p1", {
      unsupported_reason: "supported",
      transfer_status: "pending",
      created_at: Timestamp.fromMillis(100),
    });
    const huge = mockDoc("h1", {
      unsupported_reason: "supported",
      transfer_status: "in_progress",
      checkpoint_at: Timestamp.fromMillis(50),
    });
    const pick = selectNextMigrationFileCandidate({
      docs: [pending, huge],
      fairnessLastFileId: "h1",
      fairnessConsecutive: 4,
      maxConsecutive: 4,
    });
    expect(pick?.id).toBe("p1");
  });
});
