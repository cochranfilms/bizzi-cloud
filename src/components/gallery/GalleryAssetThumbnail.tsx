"use client";

import { Film, Image as ImageIcon } from "lucide-react";
import ImageWithLUT from "@/components/gallery/ImageWithLUT";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import { useInView } from "@/hooks/useInView";
import RawPreviewPlaceholder from "@/components/gallery/RawPreviewPlaceholder";
import { isRawFile } from "@/lib/gallery-file-types";

interface GalleryAssetThumbnailProps {
  galleryId: string;
  objectKey: string;
  name: string;
  mediaType: "image" | "video";
  className?: string;
  /** Use for lazy loading - skip fetch when false. Default: useInView (load when in viewport). */
  enabled?: boolean;
  /**
   * When set with previewLutSource, RAW photo tiles use WebGL LUT (dashboard asset grid).
   * Public gallery uses GalleryView; owner grid used plain &lt;img&gt; until this existed.
   */
  lutWorkflowActive?: boolean;
  /** Resolved LUT URL or builtin id — from computeGalleryAssetGridLutPreview + view API library */
  previewLutSource?: string | null;
}

export default function GalleryAssetThumbnail({
  galleryId,
  objectKey,
  name,
  mediaType,
  className = "",
  enabled,
  lutWorkflowActive = false,
  previewLutSource = null,
}: GalleryAssetThumbnailProps) {
  const [containerRef, isInView] = useInView<HTMLDivElement>();
  const shouldLoad = enabled ?? isInView;
  const applyLutGrid =
    !!lutWorkflowActive &&
    !!previewLutSource &&
    mediaType === "image" &&
    isRawFile(name);
  const { url: thumbUrl, rawPreviewUnavailable } = useGalleryThumbnail(
    galleryId,
    objectKey,
    name,
    {
      enabled: !!objectKey && shouldLoad,
      size: applyLutGrid ? "medium" : "thumb",
    }
  );

  return (
    <div
      ref={containerRef}
      className={`relative flex aspect-square items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      {rawPreviewUnavailable && mediaType === "image" ? (
        <RawPreviewPlaceholder fileName={name} className="min-h-full" />
      ) : thumbUrl ? (
        applyLutGrid ? (
          <ImageWithLUT
            key={`${objectKey}-${previewLutSource}`}
            imageUrl={thumbUrl}
            lutUrl={previewLutSource}
            lutEnabled={true}
            objectFit="cover"
            tileLayout="grid"
            className="h-full w-full"
          />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from gallery thumbnail API */}
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </>
        )
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
