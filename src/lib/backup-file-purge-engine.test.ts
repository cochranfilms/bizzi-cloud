import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { purgeBackupFilePhysicalAdmin } from "@/lib/backup-file-purge-engine";
import * as muxPurge from "@/lib/backup-file-mux-purge";
import * as macos from "@/lib/macos-package-container-admin";

vi.mock("@/lib/macos-package-container-admin", () => ({
  applyMacosPackageStatsForActiveBackupFileRemoval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/b2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/b2")>("@/lib/b2");
  return {
    ...actual,
    deleteObjectWithRetry: vi.fn().mockResolvedValue(undefined),
    isB2Configured: vi.fn().mockReturnValue(false),
  };
});

describe("purgeBackupFilePhysicalAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeDb(exists: boolean, data: Record<string, unknown>) {
    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const db = {
      _deleteMock: deleteMock,
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () =>
            exists ? { exists: true, data: () => ({ ...data }) } : { exists: false }
          ),
          delete: deleteMock,
        })),
        where: vi.fn(() => ({
          get: vi.fn(async () => ({ docs: [] })),
        })),
      })),
    };
    return db;
  }

  it("returns processed false when doc missing", async () => {
    const db = makeDb(false, {}) as never;
    const r = await purgeBackupFilePhysicalAdmin(db, "missing", { purgeJobId: "j" });
    expect(r).toEqual({ processed: false, muxCounter: null });
  });

  it("when Mux step throws, does not delete Firestore row", async () => {
    vi.spyOn(muxPurge, "purgeMuxForBackupFileStep").mockRejectedValue(new Error("mux boom"));
    const db = makeDb(true, {
      mux_asset_id: "m1",
      object_key: "",
    });
    await expect(purgeBackupFilePhysicalAdmin(db as never, "f1", { purgeJobId: "j" })).rejects.toThrow(
      "mux boom"
    );
    expect(db._deleteMock).not.toHaveBeenCalled();
  });

  it("when Mux succeeds and no B2, deletes row and returns mux counter", async () => {
    vi.spyOn(muxPurge, "purgeMuxForBackupFileStep").mockResolvedValue({
      mux_delete_attempted: true,
      outcome: "mux_deleted",
    });
    vi.spyOn(muxPurge, "muxCounterFromStepSummary").mockReturnValue("mux_deleted");
    const db = makeDb(true, { mux_asset_id: "x", object_key: "" });
    const r = await purgeBackupFilePhysicalAdmin(db as never, "f1", { purgeJobId: "j" });
    expect(r).toEqual({ processed: true, muxCounter: "mux_deleted" });
    expect(db._deleteMock).toHaveBeenCalledTimes(1);
    expect(macos.applyMacosPackageStatsForActiveBackupFileRemoval).toHaveBeenCalled();
  });

  it("no mux id still deletes row and reports mux_no_asset", async () => {
    vi.spyOn(muxPurge, "purgeMuxForBackupFileStep").mockResolvedValue({
      mux_delete_attempted: false,
      outcome: "no_mux_asset",
    });
    vi.spyOn(muxPurge, "muxCounterFromStepSummary").mockReturnValue("mux_no_asset");
    const db = makeDb(true, { object_key: "" });
    const r = await purgeBackupFilePhysicalAdmin(db as never, "f1", { purgeJobId: "j" });
    expect(r.muxCounter).toBe("mux_no_asset");
    expect(db._deleteMock).toHaveBeenCalled();
  });
});
