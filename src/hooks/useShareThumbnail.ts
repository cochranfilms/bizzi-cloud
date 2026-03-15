"use client";

import { useEffect, useRef, useState } from "react";
import { withImageThumbnailSlot } from "@/lib/thumbnailQueue";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export type ShareThumbnailSize = "thumb" | "preview";

export interface UseShareThumbnailOptions {
  size?: ShareThumbnailSize;
  /** When false, skips fetching. Use with useInView to lazy-load only visible thumbnails. */
  enabled?: boolean;
  /** For private shares, provide a function to get the auth token */
  getAuthToken?: () => Promise<string | null>;
}

/**
 * Returns a blob URL for a share image thumbnail.
 * Use for ShareView file cards. For videos, use useShareVideoThumbnail.
 */
export function useShareThumbnail(
  shareToken: string | undefined,
  objectKey: string | undefined,
  fileName: string,
  options: UseShareThumbnailOptions = {}
): string | null {
  const { size = "thumb", enabled = true, getAuthToken } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !shareToken || !objectKey || !isImageFile(fileName)) return;
    let cancelled = false;
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const token = await getAuthToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        if (cancelled) return;
        const blobUrl = await withImageThumbnailSlot(async () => {
          const params = new URLSearchParams({
            object_key: objectKey,
            size,
            name: fileName,
          });
          const res = await fetch(
            `/api/shares/${encodeURIComponent(shareToken)}/thumbnail?${params}`,
            { headers }
          );
          if (!res.ok || cancelled) return null;
          const blob = await res.blob();
          if (cancelled) return null;
          return URL.createObjectURL(blob);
        });
        if (cancelled || !blobUrl) return;
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
  }, [enabled, shareToken, objectKey, fileName, size, getAuthToken]);

  return url;
}
