"use client";

import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import type { GalleryPolicyLike } from "@/lib/video-gallery-client-policy";
import {
  clientMayDownloadGalleryFiles,
  isCommentsAllowed,
  isFavoritesAllowed,
} from "@/lib/video-gallery-client-policy";

export type GalleryVideoDetailStripProps = {
  gallery: GalleryPolicyLike & { featured_video_asset_id?: string | null };
  assets: { id: string; name: string }[];
};

/** Read-only creator summary for video / mixed galleries on gallery detail pages. */
export function GalleryVideoDetailStrip({ gallery, assets }: GalleryVideoDetailStripProps) {
  if (gallery.gallery_type !== "video" && gallery.gallery_type !== "mixed") return null;
  const mm = normalizeGalleryMediaMode({
    media_mode: gallery.media_mode ?? null,
    source_format: gallery.source_format ?? null,
  });
  const dl = clientMayDownloadGalleryFiles(gallery);
  const featured =
    assets.find((a) => a.id === gallery.featured_video_asset_id)?.name ?? "None set";
  const wf = gallery.workflow_status
    ? String(gallery.workflow_status).replace(/_/g, " ")
    : "—";

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/50 dark:text-neutral-300">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
        {gallery.gallery_type === "mixed" ? "Photo + video delivery" : "Video delivery"}
      </p>
      <p className="mt-1 leading-relaxed">
        <span className="font-medium">{mm === "raw" ? "RAW" : "Final"}</span>
        {" · "}
        {dl
          ? "Client file downloads may be available (policy + invoice + per-clip)"
          : "Stream-first or downloads blocked until payment"}
        {" · "}
        Comments {isCommentsAllowed(gallery) ? "on" : "off"}
        {" · "}
        Favorites {isFavoritesAllowed(gallery) ? "on" : "off"}
        {" · "}
        Featured clip: {featured}
        {" · "}
        Workflow: {wf}
      </p>
    </div>
  );
}
