/**
 * Creator RAW immersive reel presentation — layout constants and detection.
 * Reels use a 16:9 hero frame (same visual footprint as horizontal previews); true 9:16 clips are
 * letterboxed with black pillars via object-contain. Never use a tall 9:16 shell + cover with 16:9
 * proxies — that crops the top and bottom of vertical footage.
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
  /** Legacy rem hints (docs / tooling); layout uses `stageMaxWidthClass`. */
  maxWidthMobileRem: 30,
  maxWidthDesktopRem: 40,
  /** Match horizontal Creator RAW preview width; reserve space for comments rail on lg+. */
  stageMaxWidthClass:
    "w-full max-w-[min(96rem,calc(100vw-1.25rem))] lg:max-w-[min(96rem,calc(100vw-20rem))]",
  shellPadX: "px-2 sm:px-3 md:px-4",
  shellPadY: "py-2 sm:py-3",
  /** 16:9 outer chrome — vertical video sits inside with side pillarboxing (contain). */
  stageAspect: "16 / 9" as const,
  /** Same band as landscape `VideoWithLUT` immersive hero. */
  stageMaxHeight: "min(85dvh, calc(100dvh - 10rem))",
  /** Shared with processing placeholder — identical slot = no layout jump. */
  stageMinHeight: "min(38dvh, 21rem)",
  lutRailGap: "gap-3 sm:gap-3.5",
  lutRailMaxWidth: "min(28rem, 100%)",
  /** Outer chrome around the 16:9 hero (notch + depth). */
  frameShellClass:
    "relative w-full overflow-hidden rounded-[1.85rem] bg-neutral-950 shadow-[0_32px_100px_-28px_rgba(0,0,0,0.62),inset_0_1px_0_rgba(255,255,255,0.09)] ring-1 ring-black/25 dark:bg-black dark:shadow-[0_44px_120px_-32px_rgba(0,0,0,0.82)] dark:ring-white/12",
  processingShellClass:
    "flex w-full flex-col items-center justify-center rounded-[1.85rem] border border-white/10 bg-black/50 px-4 py-10 shadow-[0_32px_100px_-28px_rgba(0,0,0,0.55)] ring-1 ring-black/20 backdrop-blur-md dark:border-white/12 dark:bg-black/55 dark:ring-white/10",
} as const;

/** Inline style for the reel hero frame (processing + ready). Keep in sync in one place. */
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
