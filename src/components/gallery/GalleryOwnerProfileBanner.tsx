"use client";

import {
  galleryProfileDetailDescription,
  galleryProfileTitle,
  type GalleryProfileKind,
  type GalleryProfileMediaMode,
} from "@/lib/gallery-profile-copy";

interface GalleryOwnerProfileBannerProps {
  galleryType: GalleryProfileKind;
  mediaMode: GalleryProfileMediaMode;
}

export default function GalleryOwnerProfileBanner({
  galleryType,
  mediaMode,
}: GalleryOwnerProfileBannerProps) {
  const title = galleryProfileTitle(galleryType, mediaMode);
  const description = galleryProfileDetailDescription(galleryType, mediaMode);

  return (
    <div
      className="rounded-xl border-2 border-bizzi-blue/25 bg-gradient-to-br from-bizzi-blue/[0.06] to-transparent px-5 py-4 dark:border-bizzi-cyan/25 dark:from-bizzi-cyan/[0.08] dark:to-transparent"
      role="region"
      aria-label="Gallery profile"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-bizzi-blue dark:text-bizzi-cyan">
            Current profile
          </p>
          <h2 className="mt-1 text-lg font-semibold text-neutral-900 dark:text-white">{title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
