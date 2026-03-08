"use client";

import { HERO_HEIGHT_PRESETS } from "@/lib/cover-constants";
import type { HeroHeightPreset } from "@/lib/cover-constants";

interface CoverHeroProps {
  /** Image URL (blob or API URL). Parent fetches with auth when needed. */
  imageUrl: string;
  objectPosition: string;
  alt?: string | null;
  overlayOpacity?: number | null;
  heroHeight?: HeroHeightPreset | null;
  className?: string;
  priority?: boolean;
}

export default function CoverHero({
  imageUrl,
  objectPosition,
  alt = "",
  overlayOpacity = 40,
  heroHeight = "medium",
  className = "",
  priority = false,
}: CoverHeroProps) {
  const key: HeroHeightPreset = heroHeight && heroHeight in HERO_HEIGHT_PRESETS ? heroHeight : "medium";
  const preset = HERO_HEIGHT_PRESETS[key];
  const opacity = Math.max(0, Math.min(100, overlayOpacity ?? 40)) / 100;

  return (
    <div
      className={`relative w-full overflow-hidden ${className}`}
      style={{
        minHeight: `clamp(${preset.mobile}, 10vh, ${preset.desktop})`,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={alt || "Gallery cover"}
        decoding={priority ? "sync" : "async"}
        loading={priority ? "eager" : "lazy"}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, rgba(0,0,0,${opacity * 0.5}) 0%, transparent 30%, transparent 70%, rgba(0,0,0,${opacity * 0.85}) 100%)`,
        }}
        aria-hidden
      />
    </div>
  );
}
