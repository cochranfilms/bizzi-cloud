"use client";

import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|ico|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

/**
 * Returns a blob URL for a gallery asset thumbnail.
 * Images: /api/galleries/[id]/thumbnail
 * Videos: /api/galleries/[id]/video-thumbnail
 * When enabled=false (e.g. when not in viewport), skips fetch.
 */
export function useGalleryThumbnail(
  galleryId: string | undefined,
  objectKey: string | undefined,
  fileName: string,
  options?: { enabled?: boolean; size?: "thumb" | "preview" }
): string | null {
  const { enabled = true, size = "thumb" } = options ?? {};
  const isImage = objectKey && fileName && isImageFile(fileName);
  const isVideo = objectKey && fileName && isVideoFile(fileName);
  const canFetch = isImage || isVideo;

  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!galleryId || !objectKey || !canFetch || !enabled) return;
    let cancelled = false;
    const endpoint = isImage
      ? `/api/galleries/${galleryId}/thumbnail`
      : `/api/galleries/${galleryId}/video-thumbnail`;
    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token || cancelled) return;
        const params = new URLSearchParams({
          object_key: objectKey,
          size,
          name: fileName,
        });
        const res = await fetch(`${endpoint}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = blobUrl;
        setUrl(blobUrl);
      } catch {
        // Ignore – component will show fallback icon
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
    };
  }, [galleryId, objectKey, fileName, canFetch, enabled, isImage, size]);

  return url;
}
