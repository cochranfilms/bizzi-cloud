/**
 * First-class Mux step for backup_files physical purge (standard + gallery_rich).
 */
import { deleteMuxAssetWithResult } from "@/lib/mux";
import { assertMuxPurgeTerminalOrThrow, resolveMuxPurgeStrict } from "@/lib/mux-purge-gate";

export type MuxPurgeCounterBucket =
  | "mux_deleted"
  | "mux_already_missing"
  | "mux_skipped_not_configured"
  | "mux_no_asset";

export type MuxPurgeStepLogOutcome =
  | "no_mux_asset"
  | "mux_deleted"
  | "mux_already_missing"
  | "mux_skipped_not_configured";

export type MuxPurgeStepSummary = {
  mux_delete_attempted: boolean;
  outcome: MuxPurgeStepLogOutcome;
};

export type PurgeMuxFileContext = {
  purgeJobId: string;
  backupFileId: string;
  variant: "standard" | "gallery_rich";
};

function normalizeMuxId(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  return t.length > 0 ? t : undefined;
}

export function muxCounterFromStepSummary(summary: MuxPurgeStepSummary): MuxPurgeCounterBucket {
  switch (summary.outcome) {
    case "no_mux_asset":
      return "mux_no_asset";
    case "mux_deleted":
      return "mux_deleted";
    case "mux_already_missing":
      return "mux_already_missing";
    case "mux_skipped_not_configured":
      return "mux_skipped_not_configured";
  }
}

function emitPurgeMuxLog(
  ctx: PurgeMuxFileContext,
  fields: {
    mux_delete_attempted: boolean;
    mux_delete_result: MuxPurgeStepLogOutcome | string;
    mux_asset_id: string | null;
    mux_strict?: boolean;
    mux_strict_source?: string;
  }
): void {
  console.info(
    JSON.stringify({
      event: "purge_mux",
      purge_job_id: ctx.purgeJobId,
      backup_file_id: ctx.backupFileId,
      variant: ctx.variant,
      firestore_row_deleted: false,
      ...fields,
    })
  );
}

/**
 * Run Mux DELETE + strict gate. Does not call Mux when `mux_asset_id` is absent.
 */
export async function purgeMuxForBackupFileStep(
  muxAssetIdRaw: unknown,
  ctx: PurgeMuxFileContext
): Promise<MuxPurgeStepSummary> {
  const muxId = normalizeMuxId(muxAssetIdRaw);
  const { strict, source } = resolveMuxPurgeStrict();

  if (!muxId) {
    const summary: MuxPurgeStepSummary = { mux_delete_attempted: false, outcome: "no_mux_asset" };
    emitPurgeMuxLog(ctx, {
      mux_delete_attempted: false,
      mux_delete_result: "no_mux_asset",
      mux_asset_id: null,
      mux_strict: strict,
      mux_strict_source: source,
    });
    return summary;
  }

  const apiResult = await deleteMuxAssetWithResult(muxId);
  assertMuxPurgeTerminalOrThrow(apiResult, muxId);

  let outcome: MuxPurgeStepLogOutcome;
  if (apiResult.outcome === "deleted") outcome = "mux_deleted";
  else if (apiResult.outcome === "already_missing") outcome = "mux_already_missing";
  else {
    outcome = "mux_skipped_not_configured";
    console.warn(
      JSON.stringify({
        event: "purge_mux_skipped_not_configured",
        purge_job_id: ctx.purgeJobId,
        backup_file_id: ctx.backupFileId,
        mux_asset_id: muxId,
        mux_strict: strict,
        mux_strict_source: source,
      })
    );
  }

  const summary: MuxPurgeStepSummary = { mux_delete_attempted: true, outcome };
  emitPurgeMuxLog(ctx, {
    mux_delete_attempted: true,
    mux_delete_result: outcome,
    mux_asset_id: muxId,
    mux_strict: strict,
    mux_strict_source: source,
  });
  return summary;
}
