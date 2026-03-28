"use client";

import type { CSSProperties, ReactNode } from "react";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import {
  clampCoverOverlayOpacity,
  getCoverHeroContentLayout,
  getCoverHeroSectionPaddingClass,
  getCoverOverlayBackground,
  type CoverOverlayMode,
  type CoverTitleAlignment,
  getLiveHeroHeightCssVars,
} from "@/lib/gallery-cover-display";

export type CoverHeroHeightMode =
  | { kind: "live"; preset: HeroHeightPreset }
  | { kind: "preview"; minHeightPercent: string };

export interface CoverHeroShellProps {
  heightMode: CoverHeroHeightMode;
  overlayOpacity: number | null | undefined;
  overlayMode?: CoverOverlayMode;
  titleAlignment: CoverTitleAlignment | null | undefined;
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
  overlayOpacity,
  overlayMode = "solid",
  titleAlignment,
  media,
  children,
  sectionId,
  ariaLabel = "Gallery cover",
  sectionClassName,
}: CoverHeroShellProps) {
  const layout = getCoverHeroContentLayout(titleAlignment);
  const padding = getCoverHeroSectionPaddingClass();
  const o = clampCoverOverlayOpacity(overlayOpacity ?? 50);

  const heightStyle =
    heightMode.kind === "live"
      ? ({
          ...getLiveHeroHeightCssVars(heightMode.preset),
        } as CSSProperties)
      : ({ minHeight: heightMode.minHeightPercent } as CSSProperties);

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
      <div className={layout.stackClassName}>{children}</div>
    </section>
  );
}
