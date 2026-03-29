"use client";

import type { ReactNode } from "react";
import CoverHeroShell, { type CoverHeroHeightMode } from "@/components/gallery/CoverHeroShell";
import {
  COVER_HERO_TITLE_FONT_FAMILY,
  getCoverHeroContentLayout,
  type CoverHeroTypographyScope,
  type CoverOverlayMode,
  type CoverTitleAlignment,
} from "@/lib/gallery-cover-display";

export interface GalleryCoverHeroProps {
  heightMode: CoverHeroHeightMode;
  overlayOpacity: number | null | undefined;
  overlayMode?: CoverOverlayMode;
  titleAlignment: CoverTitleAlignment | null | undefined;
  /** Default `responsive` (production). Use `mobileViewport` for phone-width preview on wide monitors. */
  typographyScope?: CoverHeroTypographyScope;
  media: ReactNode;
  sectionId?: string;
  sectionClassName?: string;
  eventDate?: string | null;
  logoUrl?: string | null;
  businessName?: string | null;
  welcomeMessage?: string | null;
  prePageInstructions?: string | null;
  galleryTitle: string;
  accentColor: string;
  onViewGallery: () => void;
  /** Optional slot below pre-page instructions (e.g. video gallery meta line, pills, description). */
  beforeViewButton?: ReactNode;
}

/**
 * Public gallery hero (backdrop + overlay + content stack). Single source of truth for markup/classes
 * used on the client gallery page and in settings previews.
 */
export default function GalleryCoverHero({
  heightMode,
  overlayOpacity,
  overlayMode = "solid",
  titleAlignment,
  typographyScope = "responsive",
  media,
  sectionId,
  sectionClassName,
  eventDate,
  logoUrl,
  businessName,
  welcomeMessage,
  prePageInstructions,
  galleryTitle,
  accentColor,
  onViewGallery,
  beforeViewButton,
}: GalleryCoverHeroProps) {
  const layout = getCoverHeroContentLayout(titleAlignment, typographyScope);

  return (
    <CoverHeroShell
      heightMode={heightMode}
      contentLayout={layout}
      overlayOpacity={overlayOpacity}
      overlayMode={overlayMode}
      media={media}
      sectionId={sectionId}
      sectionClassName={sectionClassName}
    >
      {eventDate ? (
        <p className="text-xs font-medium uppercase tracking-widest text-white/90">
          {new Date(eventDate).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      ) : null}
      {(logoUrl || businessName) && (
        <div className="flex items-center gap-2">
          {logoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logoUrl}
              alt=""
              className="h-10 w-10 rounded-full border-2 border-white/30 object-cover"
            />
          ) : null}
          <span className="text-sm font-medium uppercase tracking-wider text-white/95">
            {businessName || ""}
          </span>
        </div>
      )}
      <h1
        className={layout.titleClassName}
        style={{ fontFamily: COVER_HERO_TITLE_FONT_FAMILY }}
      >
        {galleryTitle}
      </h1>
      {welcomeMessage ? (
        <p className={layout.welcomeClassName}>{welcomeMessage}</p>
      ) : null}
      {prePageInstructions ? (
        <p className={layout.instructionsClassName}>{prePageInstructions}</p>
      ) : null}
      {beforeViewButton}
      <button
        type="button"
        onClick={onViewGallery}
        className="rounded-xl px-8 py-4 text-lg font-medium text-white transition-all hover:scale-105 hover:opacity-95"
        style={{ backgroundColor: accentColor }}
      >
        View gallery
      </button>
    </CoverHeroShell>
  );
}
