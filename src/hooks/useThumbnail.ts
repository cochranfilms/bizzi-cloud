"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { GALLERY_IMAGE_EXT, isImageThumbnailTarget } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
import { NEXT_PUBLIC_THUMBNAIL_REDIRECT_TO_CDN_ENABLED } from "@/lib/public-delivery-flags";

export type ThumbnailSize = "thumb" | "preview";

export function isPreviewableMedia(name: string): boolean {
  return GALLERY_IMAGE_EXT.test(name) || shouldUseVideoThumbnailPipeline(name);
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
  options?: { enabled?: boolean; contentType?: string | null }
): string | null {
  const { enabled = true, contentType = null } = options ?? {};
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectKey || !isImageThumbnailTarget(fileName, objectKey, contentType) || !enabled) return;
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
        const useCdnRedirect =
          NEXT_PUBLIC_THUMBNAIL_REDIRECT_TO_CDN_ENABLED && size === "thumb";
        const res = await fetch(`/api/backup/thumbnail?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: useCdnRedirect ? "manual" : "follow",
        });
        if (cancelled) return;

        if (useCdnRedirect && res.status >= 300 && res.status < 400) {
          const loc = res.headers.get("Location");
          if (loc) {
            const href = new URL(loc, res.url).href;
            if (urlRef.current) {
              URL.revokeObjectURL(urlRef.current);
              urlRef.current = null;
            }
            setUrl(href);
            return;
          }
        }

        if (!res.ok) return;
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
  }, [objectKey, fileName, size, enabled, contentType]);

  return url;
}
