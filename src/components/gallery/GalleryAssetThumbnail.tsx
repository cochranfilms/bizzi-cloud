"use client";

import { Film, Image as ImageIcon } from "lucide-react";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import { useInView } from "@/hooks/useInView";

interface GalleryAssetThumbnailProps {
  galleryId: string;
  objectKey: string;
  name: string;
  mediaType: "image" | "video";
  className?: string;
  /** Use for lazy loading - skip fetch when false. Default: useInView (load when in viewport). */
  enabled?: boolean;
}

export default function GalleryAssetThumbnail({
  galleryId,
  objectKey,
  name,
  mediaType,
  className = "",
  enabled,
}: GalleryAssetThumbnailProps) {
  const [containerRef, isInView] = useInView<HTMLDivElement>();
  const shouldLoad = enabled ?? isInView;
  const thumbUrl = useGalleryThumbnail(galleryId, objectKey, name, {
    enabled: !!objectKey && shouldLoad,
  });

  return (
    <div
      ref={containerRef}
      className={`relative flex aspect-square items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      {thumbUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from gallery thumbnail API */}
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </>
      ) : (
        <>
          {mediaType === "video" ? (
            <Film className="h-8 w-8 text-neutral-400" />
          ) : (
            <ImageIcon className="h-8 w-8 text-neutral-400" />
          )}
        </>
      )}
    </div>
  );
}
