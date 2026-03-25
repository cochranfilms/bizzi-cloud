"use client";

import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Above dashboard TopNavbar (z-60) and mobile drawer (z-50) */
const OVERLAY_Z = 200;

const BACKDROP_BLUR =
  "blur(32px) saturate(1.15)";

export interface ImmersiveFilePreviewShellProps {
  onClose: () => void;
  /** Truncated in the bar when provided */
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
 * Full-viewport immersive preview: portaled to document.body so backdrop-filter
 * blurs real page content, above app chrome. Media is vertically centered in
 * the stage area; comments sit below without overlapping.
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
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setMountEl(document.body);
  }, []);

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
    ? "bg-black/55"
    : "bg-white/85 dark:bg-black/55";
  const titleClass = isGallery
    ? "text-white/95"
    : "text-neutral-900 dark:text-white/95";
  const closeBtn = isGallery
    ? "text-white/90 hover:bg-white/15"
    : "text-neutral-700 hover:bg-neutral-900/10 dark:text-white/90 dark:hover:bg-white/10";
  const asideDivider =
    isGallery ? "border-white/10 dark:border-white/10" : "border-neutral-200/50 dark:border-white/10";

  const hasBelow = !!belowFold;

  const mediaColumnClass =
    sideControls != null
      ? "flex w-full min-w-0 max-w-[min(72rem,calc(100vw-2rem))] flex-col items-center lg:max-w-[min(60rem,calc(100vw-20rem))]"
      : "flex w-full min-w-0 max-w-[min(80rem,calc(100vw-2rem))] flex-col items-center";

  /**
   * Max height for the media slot so it stays below the chrome and above comments,
   * without pinning to the top edge of the viewport.
   */
  const mediaSlotMaxH = hasBelow
    ? "max-h-[min(56dvh,calc(100dvh-12.5rem))] sm:max-h-[min(58dvh,calc(100dvh-13rem))] lg:max-h-[min(62dvh,calc(100dvh-12rem))]"
    : "max-h-[min(78dvh,calc(100dvh-7rem))] sm:max-h-[min(80dvh,calc(100dvh-7.5rem))]";

  const belowFoldClass = isGallery
    ? "relative z-10 mx-auto mt-2 w-full max-w-3xl shrink-0 rounded-xl border border-white/10 bg-black/40 px-1 pt-6 shadow-[0_8px_40px_rgba(0,0,0,0.35)] dark:border-white/10 dark:bg-black/45 sm:mt-4 sm:px-2 sm:pt-8"
    : "relative z-10 mx-auto mt-2 w-full max-w-3xl shrink-0 rounded-2xl border border-neutral-200/40 bg-white/90 pt-6 shadow-sm dark:border-white/10 dark:bg-neutral-950/70 dark:backdrop-blur-md sm:mt-4 sm:pt-8";

  const shell = (
    <div
      className="animate-immersive-preview-enter relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-contain opacity-0"
      style={{
        animationFillMode: "forwards",
        isolation: "isolate",
      }}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Preview: ${title}` : "File preview"}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out border-0 bg-neutral-950/78 p-0 transition-opacity hover:bg-neutral-950/82 dark:bg-black/82 dark:hover:bg-black/86"
        style={{
          WebkitBackdropFilter: BACKDROP_BLUR,
          backdropFilter: BACKDROP_BLUR,
        }}
        aria-label="Close preview"
        onClick={onClose}
      />

      <div
        className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1700px] flex-1 flex-col px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-[max(0.75rem,env(safe-area-inset-top))]"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={`mb-2 flex min-h-12 shrink-0 items-center gap-3 border-b px-0 py-2.5 backdrop-blur-xl sm:mb-3 ${barBorder} ${barBg}`}
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

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain pb-[max(1rem,env(safe-area-inset-bottom))] lg:gap-5">
          <div
            className={`flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 sm:gap-6 lg:flex-row lg:items-center lg:justify-center lg:gap-8 ${hasBelow ? "min-h-[min(280px,45dvh)]" : "min-h-0"}`}
          >
            <div className={`${mediaColumnClass} flex min-h-0 flex-col items-center justify-center`}>
              <div
                className={`flex w-full min-h-0 shrink-0 flex-col items-center justify-center ${mediaSlotMaxH}`}
              >
                <div className="flex h-full min-h-0 w-full max-w-full items-center justify-center px-1 sm:px-2">
                  {media}
                </div>
              </div>
              {mediaFooter ? (
                <div className="mt-2 w-full shrink-0 text-center">{mediaFooter}</div>
              ) : null}
            </div>
            {sideControls ? (
              <aside
                className={`relative z-20 w-full shrink-0 border-t pt-5 lg:w-80 lg:max-w-[min(20rem,calc(100vw-2rem))] lg:border-t-0 lg:pt-0 xl:w-80 ${asideDivider}`}
              >
                {sideControls}
              </aside>
            ) : null}
          </div>

          {belowFold ? <div className={belowFoldClass}>{belowFold}</div> : null}
        </div>
      </div>
    </div>
  );

  if (mountEl == null) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: OVERLAY_Z }}>
      {shell}
    </div>,
    mountEl
  );
}
