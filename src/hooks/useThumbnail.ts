"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { GALLERY_IMAGE_EXT } from "@/lib/gallery-file-types";
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

export type ThumbnailSize = "thumb" | "preview";

function isImageFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
}

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export function isPreviewableMedia(name: string): boolean {
  return isImageFile(name) || isVideoFile(name);
}

/**
 * Returns a blob URL for a low-res thumbnail (for cards) or preview (for modal).
 * Images: server-generated resized JPEG. Videos: returns null (use icon/placeholder).
 * When enabled=false (e.g. when not in viewport), skips fetch to reduce bandwidth.
 */
export function useThumbnail(
  objectKey: string | undefined,
  fileName: string,
  size: ThumbnailSize = "thumb",
  options?: { enabled?: boolean }
): string | null {
  const { enabled = true } = options ?? {};
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectKey || !isImageFile(fileName) || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAuthToken(false);
        if (!token || cancelled) return;
        const params = new URLSearchParams({
          object_key: objectKey,
          size,
          name: fileName,
        });
        const res = await fetch(`/api/backup/thumbnail?${params}`, {
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
        // Ignore - component will show fallback icon
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
  }, [objectKey, fileName, size, enabled]);

  return url;
}
