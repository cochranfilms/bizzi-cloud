"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { GALLERY_IMAGE_EXT, isImageThumbnailTarget } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";

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
        /**
         * Always follow redirects (including 307 → CDN). Read the final image as a blob and use a
         * blob: URL for <img src>. That avoids brittle direct CDN loads (ORB, Referrer, Worker ↔ API
         * host mismatch) while still using CDN egress when the API redirects there.
         */
        const res = await fetch(`/api/backup/thumbnail?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
          redirect: "follow",
        });
        if (cancelled) return;

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
