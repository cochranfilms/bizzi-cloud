"use client";

import { useEffect, useRef, useState } from "react";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name.toLowerCase());
}

export type TransferThumbnailSize = "thumb" | "preview";

export interface UseTransferThumbnailOptions {
  size?: TransferThumbnailSize;
  enabled?: boolean;
}

/**
 * Returns a blob URL for a transfer image thumbnail.
 * Uses the same thumbnail API as the platform.
 */
export function useTransferThumbnail(
  slug: string | undefined,
  objectKey: string | undefined,
  fileName: string,
  options: UseTransferThumbnailOptions = {}
): string | null {
  const { size = "thumb", enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!slug || !objectKey || !isImageFile(fileName) || !enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: objectKey,
          size,
          name: fileName,
        });
        const res = await fetch(
          `/api/transfers/${encodeURIComponent(slug)}/thumbnail?${params}`
        );
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
  }, [slug, objectKey, fileName, size, enabled]);

  return url;
}
