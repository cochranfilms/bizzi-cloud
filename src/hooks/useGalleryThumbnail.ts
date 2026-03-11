"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";

function isImageFile(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name);
}

function isVideoFile(name: string): boolean {
  return GALLERY_VIDEO_EXT.test(name);
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
  options?: {
    enabled?: boolean;
    size?: "thumb" | "small" | "medium" | "large" | "preview" | "cover-xs" | "cover-sm" | "cover-md" | "cover-lg" | "cover-xl";
    /** When true, fetch with credentials (cookie) instead of Bearer token. For session-only clients. */
    useCredentials?: boolean;
  }
): string | null {
  const { enabled = true, size = "thumb", useCredentials = false } = options ?? {};
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
        let headers: Record<string, string> = {};
        if (useCredentials) {
          headers = {};
        } else {
          const token = await getAuthToken(false);
          if (!token || cancelled) return;
          headers = { Authorization: `Bearer ${token}` };
        }
        const params = new URLSearchParams({
          object_key: objectKey,
          size,
          name: fileName,
        });
        const res = await fetch(`${endpoint}?${params}`, {
          headers,
          credentials: useCredentials ? "include" : "same-origin",
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
  }, [galleryId, objectKey, fileName, canFetch, enabled, isImage, size, useCredentials]);

  return url;
}
