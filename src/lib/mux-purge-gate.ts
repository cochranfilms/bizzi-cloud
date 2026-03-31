/**
 * Strict vs optional Mux purge during backup_files physical delete.
 *
 * MUX_PURGE_STRICT=true  → always strict
 * MUX_PURGE_STRICT=false → always non-strict
 * unset → strict only when VERCEL_ENV or NODE_ENV is production
 */
import type { MuxDeleteResult } from "@/lib/mux";

export type MuxPurgeStrictSource =
  | "env_explicit_true"
  | "env_explicit_false"
  | "default_production_runtime"
  | "default_non_production";

let loggedStrictResolution = false;

/** Vitest only: strict-mode log is module-global. */
export function resetMuxPurgeStrictLogForTests(): void {
  loggedStrictResolution = false;
}

export function resolveMuxPurgeStrict(): { strict: boolean; source: MuxPurgeStrictSource } {
  const raw = process.env.MUX_PURGE_STRICT?.trim().toLowerCase();
  let strict: boolean;
  let source: MuxPurgeStrictSource;

  if (raw === "true" || raw === "1") {
    strict = true;
    source = "env_explicit_true";
  } else if (raw === "false" || raw === "0") {
    strict = false;
    source = "env_explicit_false";
  } else {
    const prodRuntime =
      process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
    strict = prodRuntime;
    source = prodRuntime ? "default_production_runtime" : "default_non_production";
  }

  if (!loggedStrictResolution) {
    loggedStrictResolution = true;
    console.info(
      JSON.stringify({
        event: "mux_purge_strict_resolved",
        strict,
        source,
        at: new Date().toISOString(),
      })
    );
  }

  return { strict, source };
}

const MESSAGE_CAP = 280;

export class MuxPurgeFailedError extends Error {
  readonly code = "MuxPurgeFailedError";
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly details: { mux_asset_id?: string; http_status?: number }
  ) {
    super(message);
    this.name = "MuxPurgeFailedError";
  }
}

export class MuxPurgeBlockedError extends Error {
  readonly code = "MuxPurgeBlockedError";
  readonly retryable = false;
  constructor(message: string, readonly details: { mux_asset_id?: string }) {
    super(message);
    this.name = "MuxPurgeBlockedError";
  }
}

export function assertMuxPurgeTerminalOrThrow(
  result: MuxDeleteResult,
  muxAssetId: string
): void {
  const { strict } = resolveMuxPurgeStrict();

  if (result.outcome === "deleted" || result.outcome === "already_missing") {
    return;
  }
  if (result.outcome === "skipped_not_configured") {
    if (strict) {
      throw new MuxPurgeBlockedError(
        "Mux purge strict mode requires credentials when mux_asset_id is present",
        { mux_asset_id: muxAssetId }
      );
    }
    return;
  }
  if (result.outcome === "failed") {
    if (result.logHint) {
      console.info(
        JSON.stringify({
          event: "purge_mux_api_error_detail",
          mux_asset_id: muxAssetId,
          http_status: result.httpStatus,
          log_hint: result.logHint,
        })
      );
    }
    throw new MuxPurgeFailedError(result.message, result.retryable, {
      mux_asset_id: muxAssetId,
      http_status: result.httpStatus,
    });
  }
}

export function truncatePurgeMessage(message: string): string {
  const t = message.trim();
  if (t.length <= MESSAGE_CAP) return t;
  return `${t.slice(0, MESSAGE_CAP)}…`;
}

export type CompactPurgeLastError = {
  code: string;
  retryable: boolean;
  mux_asset_id?: string;
  http_status?: number;
  purge_job_id: string;
  file_id: string;
  message: string;
};

export function compactPurgeLastError(
  e: unknown,
  jobId: string,
  fileId: string
): string {
  if (e instanceof MuxPurgeFailedError) {
    const payload: CompactPurgeLastError = {
      code: e.code,
      retryable: e.retryable,
      purge_job_id: jobId,
      file_id: fileId,
      message: truncatePurgeMessage(e.message),
    };
    if (e.details.mux_asset_id) payload.mux_asset_id = e.details.mux_asset_id;
    if (e.details.http_status != null) payload.http_status = e.details.http_status;
    return JSON.stringify(payload);
  }
  if (e instanceof MuxPurgeBlockedError) {
    return JSON.stringify({
      code: e.code,
      retryable: false,
      mux_asset_id: e.details.mux_asset_id,
      purge_job_id: jobId,
      file_id: fileId,
      message: truncatePurgeMessage(e.message),
    } satisfies CompactPurgeLastError);
  }
  return JSON.stringify({
    code: "Error",
    retryable: true,
    purge_job_id: jobId,
    file_id: fileId,
    message: truncatePurgeMessage(e instanceof Error ? e.message : String(e)),
  } satisfies CompactPurgeLastError);
}

export function isPermanentMuxPurgeFailure(e: unknown): boolean {
  return (
    e instanceof MuxPurgeBlockedError ||
    (e instanceof MuxPurgeFailedError && !e.retryable)
  );
}
