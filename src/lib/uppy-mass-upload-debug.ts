/**
 * Dev / opt-in diagnostics for mass uploads. Safe for production: no-op unless enabled.
 */

export type MassUploadDebugEvent =
  | "ingest_start"
  | "ingest_chunks_done"
  | "ingest_canceled"
  | "progress_hz_warn"
  | "main_thread_gap_warn"
  | "dashboard_addfiles_fallback";

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "development") return false;
  try {
    return window.localStorage.getItem("bizzi:uppyDebug") === "1";
  } catch {
    return false;
  }
}

export type MassUploadDebug = {
  log: (event: MassUploadDebugEvent, payload?: Record<string, unknown>) => void;
  /** Call at start of burst; increments counter for progress handler Hz. */
  progressPing: () => void;
  resetProgressMeter: () => void;
};

export function createMassUploadDebug(): MassUploadDebug | null {
  if (!isDebugEnabled()) return null;

  let progressTicks = 0;
  let lastReset = typeof performance !== "undefined" ? performance.now() : Date.now();
  let warnedHz = false;

  const log = (event: MassUploadDebugEvent, payload?: Record<string, unknown>) => {
    // eslint-disable-next-line no-console
    console.debug(`[bizzi-uppy] ${event}`, payload ?? {});
  };

  return {
    log,
    progressPing() {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      progressTicks++;
      if (now - lastReset >= 1000) {
        if (progressTicks > 120 && !warnedHz) {
          warnedHz = true;
          log("progress_hz_warn", { eventsPerSec: progressTicks });
        }
        progressTicks = 0;
        lastReset = now;
      }
    },
    resetProgressMeter() {
      progressTicks = 0;
      warnedHz = false;
      lastReset = typeof performance !== "undefined" ? performance.now() : Date.now();
    },
  };
}

/** Optional: log if a synchronous section took “too long” (heuristic, dev only). */
export function debugMarkMainThreadGap(debug: MassUploadDebug | null, label: string, startMs: number): void {
  if (!debug) return;
  const end = typeof performance !== "undefined" ? performance.now() : Date.now();
  if (end - startMs > 64) {
    debug.log("main_thread_gap_warn", { label, ms: Math.round(end - startMs) });
  }
}
