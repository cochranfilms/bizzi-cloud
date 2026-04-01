"use client";

import { FileIcon } from "lucide-react";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
import { GALLERY_IMAGE_EXT } from "@/lib/gallery-file-types";

function isImageFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
}

const PDF_EXT = /\.pdf$/i;

type TransferModalPickThumbnailProps = {
  objectKey?: string;
  fileName: string;
  className?: string;
  /** Square tile; default ~40px Uppy-style */
  sizeClassName?: string;
};

/**
 * Compact proxy thumbnail for transfer modal browse + selection chips (backup object_key).
 */
export default function TransferModalPickThumbnail({
  objectKey,
  fileName,
  className = "",
  sizeClassName = "h-10 w-10",
}: TransferModalPickThumbnailProps) {
  const isPdf = PDF_EXT.test(fileName);
  const isVideo = shouldUseVideoThumbnailPipeline(fileName);
  const isImage = isImageFile(fileName);

  const imgUrl = useThumbnail(objectKey, fileName, "thumb", { enabled: Boolean(objectKey) && isImage });
  const vidUrl = useVideoThumbnail(objectKey, fileName, {
    enabled: Boolean(objectKey) && isVideo,
    isVideo,
  });
  const pdfUrl = usePdfThumbnail(objectKey, fileName, {
    enabled: Boolean(objectKey) && isPdf,
  });

  const url = isPdf ? pdfUrl : isVideo ? vidUrl : imgUrl;

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${sizeClassName} shrink-0 rounded-md object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} flex shrink-0 items-center justify-center rounded-md bg-neutral-100 dark:bg-neutral-800 ${className}`}
    >
      <FileIcon className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
    </div>
  );
}
