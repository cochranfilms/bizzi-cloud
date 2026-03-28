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

const PREVIEW_FRAME_MOBILE_H = 560;
const PREVIEW_FRAME_DESKTOP_H = 400;

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
}: CoverHeroPreviewProps) {
  const layout = getCoverHeroContentLayout(titleAlignment);
  const minPct = getPreviewHeroMinHeightPercent(heroPreset, previewMode);

  const frameH =
    previewMode === "mobile" ? PREVIEW_FRAME_MOBILE_H : PREVIEW_FRAME_DESKTOP_H;
  const frameW = previewMode === "mobile" ? "390px" : "100%";
  const maxW = previewMode === "mobile" ? "390px" : "960px";

  if (!imageUrl) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-100 text-sm text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
        style={{ height: frameH, width: frameW, maxWidth: maxW }}
      >
        Select a cover photo to preview
      </div>
    );
  }

  return (
    <div
      className="mx-auto overflow-hidden rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-600"
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
        sectionClassName="!py-12"
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
          <p className="text-[10px] font-medium uppercase tracking-widest text-white/90 sm:text-xs">
            {new Date(eventDate).toLocaleDateString(undefined, {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
        <h2
          className={`${layout.titleClassName} text-2xl sm:text-3xl`}
          style={{ fontFamily: COVER_HERO_TITLE_FONT_FAMILY }}
        >
          {galleryTitle || "Gallery title"}
        </h2>
        <button
          type="button"
          className="pointer-events-none rounded-xl px-6 py-2.5 text-sm font-medium text-white opacity-90 sm:px-8 sm:py-4 sm:text-lg"
          style={{ backgroundColor: accentColor }}
          tabIndex={-1}
        >
          View gallery
        </button>
      </CoverHeroShell>
    </div>
  );
}
