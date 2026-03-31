/**
 * Creator RAW immersive portrait ("reel") presentation — layout constants and detection.
 * Portrait and landscape use separate max widths, padding, and rail spacing (see CREATOR_RAW_PORTRAIT_STAGE).
 */

/** Portrait clip: height / width >= this ratio (9:16 ≈ 1.78). */
export const CREATOR_RAW_REEL_MIN_HEIGHT_OVER_WIDTH = 1.25;

/** Match common broll / phone filenames: 1080x1920, 9x16, vertical, portrait. */
const FILENAME_DIM_RE = /(\d{3,4})[x×](\d{3,4})/i;
const FILENAME_PORTRAIT_FLAG_RE = /(?:^|[-_\s])(9x16|vertical|portrait|1080x1920)(?:[-_\s]|\.|$)/i;

export type CreatorRawReelEvidenceSource = "firestore" | "filename" | "stream_api" | "video_element";

export type CreatorRawReelEvidence = {
  source: CreatorRawReelEvidenceSource;
  width: number;
  height: number;
};

export const CREATOR_RAW_PORTRAIT_STAGE = {
  /** Max width of the phone-style stage (tailwind arbitrary helpers — consumed in TS for tests). */
  maxWidthMobileRem: 26.25,
  maxWidthDesktopRem: 28.75,
  shellPadX: "px-2 sm:px-3 md:px-4",
  shellPadY: "py-2 sm:py-3",
  /** Fixed 9:16 slot min-height so loading → proxy → mux does not jump */
  stageAspect: "9 / 16" as const,
  stageMaxHeight: "min(82dvh, calc(100dvh - 13.5rem))",
  /** Shared with processing placeholder — identical slot = no layout jump. */
  stageMinHeight: "min(52dvh, 28rem)",
  lutRailGap: "gap-3 sm:gap-3.5",
  lutRailMaxWidth: "min(28rem, 100%)",
} as const;

/** Inline style for the portrait “device” frame (processing + ready). Keep in sync in one place. */
export const CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE = {
  aspectRatio: CREATOR_RAW_PORTRAIT_STAGE.stageAspect,
  maxHeight: CREATOR_RAW_PORTRAIT_STAGE.stageMaxHeight,
  minHeight: CREATOR_RAW_PORTRAIT_STAGE.stageMinHeight,
} as const;

export function parsePortraitDimensionsFromFileName(fileName: string): { width: number; height: number } | null {
  const m = FILENAME_DIM_RE.exec(fileName);
  if (!m) return null;
  const w = parseInt(m[1]!, 10);
  const h = parseInt(m[2]!, 10);
  if (!w || !h) return null;
  /** Interpret as width×height in filename order; do not swap (avoids 1920×1080 mis-read as portrait). */
  if (h >= w * CREATOR_RAW_REEL_MIN_HEIGHT_OVER_WIDTH) return { width: w, height: h };
  return null;
}

export function fileNameSuggestsPortraitReel(fileName: string): boolean {
  if (FILENAME_PORTRAIT_FLAG_RE.test(fileName)) return true;
  return parsePortraitDimensionsFromFileName(fileName) != null;
}

/**
 * Whether immersive preview should use premium portrait ("reel") stage.
 * Merges all evidence; prefers largest height consistent with portrait.
 */
export function resolveCreatorRawReelPortrait(
  evidences: CreatorRawReelEvidence[],
  minHeightOverWidth = CREATOR_RAW_REEL_MIN_HEIGHT_OVER_WIDTH
): boolean {
  for (const e of evidences) {
    if (e.width > 0 && e.height > 0 && e.height >= e.width * minHeightOverWidth) {
      return true;
    }
  }
  return false;
}

/** Creator RAW proxy-only playback: never use preview-url / original object for the video element. */
export function creatorRawImmersiveVideoUsesProxyOnly(showLUTForVideo: boolean, previewKind: string): boolean {
  return showLUTForVideo && previewKind === "video";
}
