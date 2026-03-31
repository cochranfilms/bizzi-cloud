import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  muxCounterFromStepSummary,
  purgeMuxForBackupFileStep,
} from "@/lib/backup-file-mux-purge";
import * as mux from "@/lib/mux";
import { resetMuxPurgeStrictLogForTests } from "@/lib/mux-purge-gate";

describe("purgeMuxForBackupFileStep", () => {
  const ctx = {
    purgeJobId: "job1",
    backupFileId: "file1",
    variant: "standard" as const,
  };

  afterEach(() => {
    vi.restoreAllMocks();
    resetMuxPurgeStrictLogForTests();
  });

  it("does not call Mux when mux_asset_id absent; outcome no_mux_asset", async () => {
    const spy = vi.spyOn(mux, "deleteMuxAssetWithResult");
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const s = await purgeMuxForBackupFileStep(undefined, ctx);
    expect(spy).not.toHaveBeenCalled();
    expect(s).toEqual({ mux_delete_attempted: false, outcome: "no_mux_asset" });
    expect(muxCounterFromStepSummary(s)).toBe("mux_no_asset");
    const line = log.mock.calls.find((c) =>
      String(c[0]).includes('"event":"purge_mux"')
    )?.[0] as string;
    expect(JSON.parse(line).mux_delete_result).toBe("no_mux_asset");
  });

  it("does not call Mux for empty string id", async () => {
    const spy = vi.spyOn(mux, "deleteMuxAssetWithResult");
    await purgeMuxForBackupFileStep("  ", ctx);
    expect(spy).not.toHaveBeenCalled();
  });

  it("maps deleted to mux_deleted counter", async () => {
    process.env.MUX_PURGE_STRICT = "false";
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(mux, "deleteMuxAssetWithResult").mockResolvedValue({
      outcome: "deleted",
      httpStatus: 204,
    });
    const s = await purgeMuxForBackupFileStep("mux_a", ctx);
    expect(s.outcome).toBe("mux_deleted");
    expect(muxCounterFromStepSummary(s)).toBe("mux_deleted");
  });
});
