"use client";

import type { CSSProperties, ReactNode } from "react";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import {
  clampCoverOverlayOpacity,
  getCoverHeroSectionPaddingClass,
  getCoverOverlayBackground,
  getLiveHeroHeightCssVars,
  type CoverHeroContentLayout,
  type CoverOverlayMode,
} from "@/lib/gallery-cover-display";

export type CoverHeroHeightMode =
  | { kind: "live"; preset: HeroHeightPreset }
  | { kind: "preview"; minHeightPx: number };

export interface CoverHeroShellProps {
  heightMode: CoverHeroHeightMode;
  contentLayout: CoverHeroContentLayout;
  overlayOpacity: number | null | undefined;
  overlayMode?: CoverOverlayMode;
  media: ReactNode;
  children: ReactNode;
  sectionId?: string;
  ariaLabel?: string;
  sectionClassName?: string;
}

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function CoverHeroShell({
  heightMode,
  contentLayout,
  overlayOpacity,
  overlayMode = "solid",
  media,
  children,
  sectionId,
  ariaLabel = "Gallery cover",
  sectionClassName,
}: CoverHeroShellProps) {
  const padding = getCoverHeroSectionPaddingClass();
  const o = clampCoverOverlayOpacity(overlayOpacity ?? 50);

  const heightStyle =
    heightMode.kind === "live"
      ? ({
          ...getLiveHeroHeightCssVars(heightMode.preset),
        } as CSSProperties)
      : ({ minHeight: `${heightMode.minHeightPx}px` } as CSSProperties);

  return (
    <section
      id={sectionId}
      aria-label={ariaLabel}
      className={cx(
        "relative flex w-full flex-col items-center justify-center",
        padding,
        heightMode.kind === "live" && "gallery-hero-dynamic-height",
        sectionClassName
      )}
      style={heightStyle}
    >
      <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
        <div className="relative h-full w-full">{media}</div>
        <div
          className="absolute inset-0"
          style={{ background: getCoverOverlayBackground(o, overlayMode) }}
        />
      </div>
      <div className={contentLayout.stackClassName}>{children}</div>
    </section>
  );
}
