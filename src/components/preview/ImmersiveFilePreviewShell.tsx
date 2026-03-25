"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export interface ImmersiveFilePreviewShellProps {
  onClose: () => void;
  /** Truncated in the sticky bar when provided */
  title?: string;
  /** Extra controls in the top bar (download, hearts, etc.) */
  headerActions?: ReactNode;
  /** Main media only — image, video player, loading state */
  media: ReactNode;
  /** LUT / tools: beside media on lg+, full width below media on small screens */
  sideControls?: ReactNode | null;
  /** Hint or accessory row directly under the media block (e.g. low-res notice) */
  mediaFooter?: ReactNode | null;
  /** Comments or other content; full width below the media + controls row */
  belowFold?: ReactNode | null;
  /** Visual language for chrome text and glass surfaces */
  variant?: "gallery" | "app";
}

/**
 * Full-viewport immersive preview: blurred+darkened backdrop, scroll only when needed,
 * media sized to fit the viewport (with room for comments when present), centered side-by-side controls on large screens.
 */
export default function ImmersiveFilePreviewShell({
  onClose,
  title,
  headerActions,
  media,
  sideControls,
  mediaFooter,
  belowFold,
  variant = "app",
}: ImmersiveFilePreviewShellProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isGallery = variant === "gallery";
  const barBorder = isGallery ? "border-white/10" : "border-neutral-200/25 dark:border-white/10";
  const barBg = isGallery
    ? "bg-black/25"
    : "bg-white/70 dark:bg-black/25";
  const titleClass = isGallery
    ? "text-white/95"
    : "text-neutral-900 dark:text-white/95";
  const closeBtn = isGallery
    ? "text-white/90 hover:bg-white/15"
    : "text-neutral-700 hover:bg-neutral-900/10 dark:text-white/90 dark:hover:bg-white/10";

  const hasBelow = !!belowFold;
  /** Explicit stage height so nested video/image h-full resolves; keeps comments on-screen */
  const stageH = hasBelow
    ? "min-h-[min(200px,40dvh)] h-[min(46dvh,calc(100dvh-15.5rem))] max-h-[min(46dvh,calc(100dvh-15.5rem))] sm:h-[min(48dvh,calc(100dvh-16rem))] sm:max-h-[min(48dvh,calc(100dvh-16rem))] lg:h-[min(50dvh,calc(100dvh-15rem))] lg:max-h-[min(50dvh,calc(100dvh-15rem))]"
    : "min-h-[min(200px,40dvh)] h-[min(68dvh,calc(100dvh-8rem))] max-h-[min(68dvh,calc(100dvh-8rem))] sm:h-[min(70dvh,calc(100dvh-8.5rem))] sm:max-h-[min(70dvh,calc(100dvh-8.5rem))]";

  const mediaColumnClass =
    sideControls != null
      ? "flex w-full min-w-0 flex-1 flex-col items-center lg:max-w-[min(100%,calc(100vw-20rem))]"
      : "flex w-full min-w-0 flex-1 flex-col items-center";

  return (
    <div
      className="animate-immersive-preview-enter fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain opacity-0"
      style={{ animationFillMode: "forwards" }}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Preview: ${title}` : "File preview"}
    >
      <button
        type="button"
        className="fixed inset-0 bg-neutral-950/55 backdrop-blur-2xl backdrop-saturate-150 dark:bg-black/70"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div
        className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[1700px] flex-1 flex-col px-3 pb-10 pt-[max(0.25rem,env(safe-area-inset-top))] sm:px-6 sm:pb-12"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={`sticky top-0 z-30 -mx-3 mb-3 flex min-h-12 shrink-0 items-center gap-3 border-b px-3 py-2.5 backdrop-blur-xl sm:-mx-6 sm:mb-4 sm:px-6 ${barBorder} ${barBg}`}
        >
          {title ? (
            <h2
              className={`min-w-0 flex-1 truncate text-sm font-medium tracking-tight sm:text-base ${titleClass}`}
              title={title}
            >
              {title}
            </h2>
          ) : (
            <div className="flex-1" />
          )}
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{headerActions}</div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`touch-target-sm ml-auto flex shrink-0 items-center justify-center rounded-full p-2 transition-colors ${closeBtn}`}
            aria-label="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-5 lg:gap-6">
          <div
            className={`flex min-h-0 flex-1 flex-col items-stretch justify-center gap-5 lg:flex-row lg:items-center lg:justify-center lg:gap-8 ${hasBelow ? "lg:min-h-0" : ""}`}
          >
            <div className={`${mediaColumnClass} flex min-h-0 flex-col items-center justify-center`}>
              <div
                className={`flex w-full shrink-0 flex-col items-center justify-center ${stageH}`}
              >
                <div className="flex h-full min-h-0 w-full max-w-full items-center justify-center px-1">
                  {media}
                </div>
              </div>
              {mediaFooter ? <div className="mt-2 w-full shrink-0">{mediaFooter}</div> : null}
            </div>
            {sideControls ? (
              <aside className="relative z-20 w-full shrink-0 lg:max-w-[18rem] lg:self-center xl:w-80">
                {sideControls}
              </aside>
            ) : null}
          </div>

          {belowFold ? (
            <div className="relative z-10 mx-auto mt-2 w-full max-w-3xl shrink-0 border-t border-neutral-200/30 pt-6 dark:border-white/10 sm:mt-4 sm:pt-8">
              {belowFold}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
