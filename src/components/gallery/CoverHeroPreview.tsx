"use client";

import { useRef, useState, useCallback } from "react";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import CoverHeroShell from "@/components/gallery/CoverHeroShell";
import {
  COVER_HERO_TITLE_FONT_FAMILY,
  getCoverHeroContentLayout,
  getPreviewHeroMinHeightPercent,
  type CoverTitleAlignment,
} from "@/lib/gallery-cover-display";

/** Default sizes for embedded settings editor (compact, card-friendly). */
const COMPACT_DESKTOP_FRAME_H = 210;
const COMPACT_MOBILE_FRAME_H = 200;
const COMPACT_MOBILE_FRAME_W = 168;
const COMPACT_DESKTOP_MAX_W = 420;

/** Larger preview when not embedded in a narrow form card. */
const DEFAULT_DESKTOP_FRAME_H = 400;
const DEFAULT_MOBILE_FRAME_H = 560;
const DEFAULT_MOBILE_FRAME_W = 390;
const DEFAULT_DESKTOP_MAX_W = 960;

export interface CoverHeroPreviewProps {
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  onFocalChange?: (x: number, y: number) => void;
  overlayOpacity: number;
  titleAlignment: CoverTitleAlignment;
  heroPreset: HeroHeightPreset;
  previewMode: "desktop" | "mobile";
  galleryTitle: string;
  eventDate?: string | null;
  accentColor: string;
  interactive?: boolean;
  /** Smaller shells for gallery settings card (default true). */
  compact?: boolean;
}

function InteractiveCoverMedia({
  imageUrl,
  focalX,
  focalY,
  onFocalChange,
  interactive,
}: {
  imageUrl: string;
  focalX: number;
  focalY: number;
  onFocalChange?: (x: number, y: number) => void;
  interactive?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, focalX: 0, focalY: 0 });

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!interactive || !onFocalChange) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        focalX,
        focalY,
      };
    },
    [interactive, onFocalChange, focalX, focalY]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !onFocalChange || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const SENSITIVITY = 1.5;
      const dx =
        ((e.clientX - dragStartRef.current.x) / rect.width) * 100 * SENSITIVITY;
      const dy =
        ((e.clientY - dragStartRef.current.y) / rect.height) * 100 * SENSITIVITY;
      const newX = Math.max(0, Math.min(100, dragStartRef.current.focalX - dx));
      const newY = Math.max(0, Math.min(100, dragStartRef.current.focalY - dy));
      onFocalChange(newX, newY);
    },
    [dragging, onFocalChange]
  );

  const endDrag = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    setDragging(false);
  }, []);

  return (
    <div ref={containerRef} className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="h-full w-full select-none object-cover"
        style={{
          objectPosition: `${focalX}% ${focalY}%`,
          pointerEvents: "none",
        }}
        draggable={false}
      />
      {interactive && onFocalChange ? (
        <div
          role="presentation"
          className={`absolute inset-0 touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          style={{ pointerEvents: "auto" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
      ) : null}
    </div>
  );
}

export default function CoverHeroPreview({
  imageUrl,
  focalX,
  focalY,
  onFocalChange,
  overlayOpacity,
  titleAlignment,
  heroPreset,
  previewMode,
  galleryTitle,
  eventDate,
  accentColor,
  interactive = true,
  compact = true,
}: CoverHeroPreviewProps) {
  const layout = getCoverHeroContentLayout(titleAlignment);
  const minPct = getPreviewHeroMinHeightPercent(heroPreset, previewMode);

  const isMobile = previewMode === "mobile";
  const frameH = compact
    ? isMobile
      ? COMPACT_MOBILE_FRAME_H
      : COMPACT_DESKTOP_FRAME_H
    : isMobile
      ? DEFAULT_MOBILE_FRAME_H
      : DEFAULT_DESKTOP_FRAME_H;
  const frameW = compact
    ? isMobile
      ? `${COMPACT_MOBILE_FRAME_W}px`
      : "100%"
    : isMobile
      ? `${DEFAULT_MOBILE_FRAME_W}px`
      : "100%";
  const maxW = compact
    ? isMobile
      ? COMPACT_MOBILE_FRAME_W
      : COMPACT_DESKTOP_MAX_W
    : isMobile
      ? DEFAULT_MOBILE_FRAME_W
      : DEFAULT_DESKTOP_MAX_W;

  const shellPad = compact ? "!py-6 !px-3 sm:!px-4" : "!py-12";
  const titleClass = compact
    ? `${layout.titleClassName} text-base font-semibold leading-snug`
    : `${layout.titleClassName} text-2xl sm:text-3xl`;
  const dateClass = compact
    ? "text-[9px] font-medium uppercase tracking-widest text-white/90"
    : "text-[10px] font-medium uppercase tracking-widest text-white/90 sm:text-xs";
  const buttonClass = compact
    ? "pointer-events-none rounded-lg px-4 py-2 text-xs font-medium text-white opacity-90"
    : "pointer-events-none rounded-xl px-6 py-2.5 text-sm font-medium text-white opacity-90 sm:px-8 sm:py-4 sm:text-lg";

  if (!imageUrl) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-dashed border-neutral-300/90 bg-neutral-100/80 px-2 text-center text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400"
        style={{
          height: frameH,
          width: frameW,
          maxWidth: maxW,
        }}
      >
        Select a cover photo to preview
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-hidden rounded-xl border border-neutral-200/90 bg-neutral-950 shadow-sm dark:border-neutral-600/80"
      style={{
        height: frameH,
        width: frameW,
        maxWidth: maxW,
      }}
    >
      <CoverHeroShell
        heightMode={{ kind: "preview", minHeightPercent: minPct }}
        overlayOpacity={overlayOpacity}
        overlayMode="solid"
        titleAlignment={titleAlignment}
        sectionClassName={shellPad}
        media={
          <InteractiveCoverMedia
            imageUrl={imageUrl}
            focalX={focalX}
            focalY={focalY}
            onFocalChange={onFocalChange}
            interactive={interactive}
          />
        }
      >
        {eventDate ? (
          <p className={dateClass}>
            {new Date(eventDate).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
        <h2 className={titleClass} style={{ fontFamily: COVER_HERO_TITLE_FONT_FAMILY }}>
          {galleryTitle || "Gallery title"}
        </h2>
        <button
          type="button"
          className={buttonClass}
          style={{ backgroundColor: accentColor }}
          tabIndex={-1}
        >
          View gallery
        </button>
      </CoverHeroShell>
    </div>
  );
}
