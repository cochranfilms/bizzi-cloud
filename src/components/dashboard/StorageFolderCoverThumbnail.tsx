"use client";

import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { isImageThumbnailTarget } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";

const PDF_EXT = /\.pdf$/i;

export type StorageFolderCoverSource = {
  objectKey: string;
  fileName: string;
  contentType?: string | null;
};

type StorageFolderCoverThumbnailProps = {
  cover: StorageFolderCoverSource;
  /** Full-bleed behind folder icon (card hero). */
  variant: "backdrop" | "tile";
  /** Extra classes on the image (e.g. tile size). */
  className?: string;
};

/**
 * Resolved image/PDF/video frame thumbnail for a Storage v2 folder cover (backup proxy APIs).
 */
export default function StorageFolderCoverThumbnail({
  cover,
  variant,
  className = "",
}: StorageFolderCoverThumbnailProps) {
  const { objectKey, fileName, contentType } = cover;
  const isPdf = PDF_EXT.test(fileName) || contentType === "application/pdf";
  const isVideo =
    !isAppleDoubleLeafName(fileName) &&
    (shouldUseVideoThumbnailPipeline(fileName) || Boolean(contentType?.startsWith("video/")));
  const isImage = isImageThumbnailTarget(fileName, objectKey, contentType);

  const imgUrl = useThumbnail(objectKey, fileName, "thumb", {
    enabled: Boolean(objectKey) && isImage,
    contentType: contentType ?? null,
  });
  const vidUrl = useVideoThumbnail(objectKey, fileName, {
    enabled: Boolean(objectKey) && isVideo,
    isVideo,
  });
  const pdfUrl = usePdfThumbnail(objectKey, fileName, {
    enabled: Boolean(objectKey) && isPdf,
  });

  const url = isPdf ? pdfUrl : isVideo ? vidUrl : imgUrl;
  if (!url) return null;

  if (variant === "backdrop") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`pointer-events-none absolute inset-0 z-0 h-full w-full min-h-full min-w-full object-cover [object-position:center] ${className}`.trim()}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`h-full w-full object-cover ${className}`.trim()}
    />
  );
}
