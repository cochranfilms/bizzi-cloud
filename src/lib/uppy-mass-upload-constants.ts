/**
 * Thresholds for mass-upload UX/perf (chunking, throttling, previews).
 * Tuned for ~150–500 file drops; extreme tier reduces accidental browser death (e.g. 2000+ files).
 */

export type BatchTier = "normal" | "large" | "extreme";

export function batchTierRank(t: BatchTier): number {
  if (t === "extreme") return 2;
  if (t === "large") return 1;
  return 0;
}

export function maxBatchTier(a: BatchTier, b: BatchTier): BatchTier {
  return batchTierRank(a) >= batchTierRank(b) ? a : b;
}

/** Soft “large batch” — idle previews, stronger progress throttles, optimization banner. */
export const LARGE_BATCH_MIN = 50;

/** Hard “extreme” — no previews, smallest chunks, strongest throttles, minimal cards. */
export const EXTREME_BATCH_MIN = 200;

export function getBatchTierFromCount(n: number): BatchTier {
  if (n >= EXTREME_BATCH_MIN) return "extreme";
  if (n >= LARGE_BATCH_MIN) return "large";
  return "normal";
}

export function getIngestChunkSize(tier: BatchTier): number {
  switch (tier) {
    case "extreme":
      return 20;
    case "large":
      return 30;
    default:
      return 40;
  }
}

/** Aggregate header progress throttle (ms) by tier. */
export function getAggregateProgressThrottleMs(tier: BatchTier): number {
  switch (tier) {
    case "extreme":
      return 280;
    case "large":
      return 160;
    default:
      return 100;
  }
}

/** Grid progress epoch throttle (visible cell refresh). */
export function getGridProgressThrottleMs(tier: BatchTier): number {
  switch (tier) {
    case "extreme":
      return 260;
    case "large":
      return 140;
    default:
      return 90;
  }
}

/** Max rate for gallery manage-grid upload_progress (ms between emits per file). */
export function getGalleryProgressMinIntervalMs(tier: BatchTier): number {
  switch (tier) {
    case "extreme":
      return 200;
    case "large":
      return 120;
    default:
      return 80;
  }
}

/** react-window FixedSizeGrid overscan (rows / cols beyond viewport). */
export const UPLOAD_GRID_OVERSCAN_ROW = 2;
export const UPLOAD_GRID_OVERSCAN_COL = 1;

/** Fixed row height in px (includes internal padding; must not grow with content). */
export const UPLOAD_GRID_CARD_ROW_HEIGHT = 120;

/** Gap between virtualized grid cells (must match `VirtualizedUploadFileGrid`). */
export const UPLOAD_GRID_GAP = 8;

/** react-window row height: card row + gap below each row. */
export const UPLOAD_GRID_VIRTUAL_ROW_STRIDE = UPLOAD_GRID_CARD_ROW_HEIGHT + UPLOAD_GRID_GAP;
