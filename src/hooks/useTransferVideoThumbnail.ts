"use client";

import { useEffect, useRef, useState } from "react";
import { withThumbnailSlot } from "@/lib/thumbnailQueue";

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export interface UseTransferVideoThumbnailOptions {
  enabled?: boolean;
}

/**
 * Returns a blob URL for a transfer video thumbnail.
 * Uses getTransferVideoThumbnail - the exact same function as og-image and platform.
 */
export function useTransferVideoThumbnail(
  slug: string | undefined,
  objectKey: string | undefined,
  fileName: string,
  options: UseTransferVideoThumbnailOptions = {}
): string | null {
  const { enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || !objectKey || !isVideoFile(fileName) || !enabled) return;

    let cancelled = false;

    const setBlobUrl = (blobUrl: string) => {
      if (cancelled) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = blobUrl;
      setUrl(blobUrl);
    };

    (async () => {
      try {
        const ok = await withThumbnailSlot(async () => {
          const params = new URLSearchParams({
            object_key: objectKey,
            name: fileName,
          });
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 25000);
          try {
            const res = await fetch(
              `/api/transfers/${encodeURIComponent(slug)}/video-thumbnail?${params}`,
              { signal: controller.signal }
            );
            clearTimeout(timeoutId);
            if (!res.ok || cancelled) return false;
            const blob = await res.blob();
            if (cancelled || blob.size === 0) return false;
            setBlobUrl(URL.createObjectURL(blob));
            return true;
          } catch {
            clearTimeout(timeoutId);
            return false;
          }
        });
        if (!ok) return;
      } catch {
        // Ignore - fallback icon will show
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
  }, [slug, objectKey, fileName, enabled]);

  return url;
}
