"use client";

import { useRef, useState, useCallback, useLayoutEffect } from "react";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import GalleryCoverHero from "@/components/gallery/GalleryCoverHero";
import {
  getSimulatedHeroMinHeightPx,
  resolveCoverObjectPosition,
  type CoverTitleAlignment,
} from "@/lib/gallery-cover-display";

/** Simulated browser viewports — hero is laid out at these dimensions, then scaled into the card. */
export const SETTINGS_HERO_VIEWPORT_DESKTOP = { width: 1280, height: 720 } as const;
export const SETTINGS_HERO_VIEWPORT_MOBILE = { width: 390, height: 844 } as const;

function InteractiveCoverMedia({
  imageUrl,
  objectPosition,
  interactive,
  onFocalChange,
  focalX,
  focalY,
}: {
  imageUrl: string;
  objectPosition: string;
  interactive: boolean;
  onFocalChange?: (x: number, y: number) => void;
  focalX: number;
  focalY: number;
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
          objectPosition,
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

export interface GalleryCoverHeroSettingsPreviewProps {
  device: "desktop" | "mobile";
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  onFocalChange?: (x: number, y: number) => void;
  coverPosition?: string | null;
  overlayOpacity: number;
  titleAlignment: CoverTitleAlignment;
  heroPreset: HeroHeightPreset;
  galleryTitle: string;
  eventDate?: string | null;
  accentColor: string;
  logoUrl?: string | null;
  businessName?: string | null;
  welcomeMessage?: string | null;
  prePageInstructions?: string | null;
  maxDisplayWidth?: number;
  interactive?: boolean;
}

function GalleryCoverHeroSettingsPreviewWithImage({
  device,
  imageUrl,
  focalX,
  focalY,
  onFocalChange,
  coverPosition,
  overlayOpacity,
  titleAlignment,
  heroPreset,
  galleryTitle,
  eventDate,
  accentColor,
  logoUrl,
  businessName,
  welcomeMessage,
  prePageInstructions,
  maxDisplayWidth = 640,
  interactive = true,
}: GalleryCoverHeroSettingsPreviewProps & { imageUrl: string }) {
  const vp =
    device === "desktop" ? SETTINGS_HERO_VIEWPORT_DESKTOP : SETTINGS_HERO_VIEWPORT_MOBILE;
  const minHeroPx = getSimulatedHeroMinHeightPx(
    heroPreset,
    device === "mobile" ? "mobile" : "desktop",
    vp.height
  );

  const objectPosition = resolveCoverObjectPosition({
    cover_focal_x: focalX,
    cover_focal_y: focalY,
    cover_position: coverPosition,
  });

  /** Cap display width by viewport so we never scale above 1; callers set desired stage width. */
  const capW = Math.min(maxDisplayWidth, vp.width);
  const scale = Math.min(1, capW / vp.width);

  const measureRef = useRef<HTMLDivElement>(null);
  const [contentSize, setContentSize] = useState<{ w: number; h: number }>({
    w: vp.width,
    h: minHeroPx + 320,
  });

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setContentSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    minHeroPx,
    imageUrl,
    galleryTitle,
    eventDate,
    overlayOpacity,
    titleAlignment,
    heroPreset,
    device,
    welcomeMessage,
    prePageInstructions,
    businessName,
    logoUrl,
  ]);

  const inner = (
    <div ref={measureRef} className="bg-neutral-950" style={{ width: vp.width, minHeight: minHeroPx }}>
      <GalleryCoverHero
        heightMode={{ kind: "preview", minHeightPx: minHeroPx }}
        overlayOpacity={overlayOpacity}
        overlayMode="solid"
        titleAlignment={titleAlignment}
        typographyScope={device === "mobile" ? "mobileViewport" : "responsive"}
        media={
          <InteractiveCoverMedia
            imageUrl={imageUrl}
            objectPosition={objectPosition}
            interactive={interactive}
            onFocalChange={onFocalChange}
            focalX={focalX}
            focalY={focalY}
          />
        }
        eventDate={eventDate || null}
        logoUrl={logoUrl}
        businessName={businessName}
        welcomeMessage={welcomeMessage || null}
        prePageInstructions={prePageInstructions || null}
        galleryTitle={galleryTitle}
        accentColor={accentColor}
        onViewGallery={() => {}}
      />
    </div>
  );

  return (
    <div
      className="overflow-hidden rounded-xl border border-neutral-200/90 bg-neutral-100/50 shadow-sm dark:border-neutral-600/80 dark:bg-neutral-900/40"
      style={{
        width: contentSize.w * scale,
        height: contentSize.h * scale,
        maxWidth: "100%",
      }}
    >
      <div
        style={{
          width: vp.width,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {inner}
      </div>
    </div>
  );
}

/**
 * Scaled, true-to-production hero for gallery settings: same `GalleryCoverHero` as the public page
 * inside a simulated desktop or mobile viewport.
 */
export default function GalleryCoverHeroSettingsPreview(
  props: GalleryCoverHeroSettingsPreviewProps
) {
  const { imageUrl, maxDisplayWidth = 640 } = props;

  if (!imageUrl) {
    return (
      <div
        className="mx-auto flex min-h-[120px] w-full max-w-[min(720px,100%)] items-center justify-center rounded-xl border border-dashed border-neutral-300/90 bg-neutral-100/80 px-4 text-center text-xs text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800/50 dark:text-neutral-400"
      >
        Select a cover photo to preview
      </div>
    );
  }

  return <GalleryCoverHeroSettingsPreviewWithImage {...props} imageUrl={imageUrl} />;
}
