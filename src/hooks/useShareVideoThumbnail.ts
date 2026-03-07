"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export interface UseShareVideoThumbnailOptions {
  enabled?: boolean;
  /** For private shares, provide a function to get the auth token */
  getAuthToken?: () => Promise<string | null>;
}

/**
 * Returns a blob URL for a share video thumbnail.
 * Uses server-side FFmpeg to extract a frame (works for ProRes, MXF, etc. that browsers can't decode).
 */
export function useShareVideoThumbnail(
  shareToken: string | undefined,
  objectKey: string | undefined,
  fileName: string,
  options: UseShareVideoThumbnailOptions = {}
): string | null {
  const { enabled = true, getAuthToken } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!shareToken || !objectKey || !isVideoFile(fileName) || !enabled) return;

    let cancelled = false;

    const cleanup = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
    };

    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: objectKey,
          name: fileName,
        });
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const token = await getAuthToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        if (cancelled) return;

        const res = await fetch(
          `/api/shares/${encodeURIComponent(shareToken)}/video-thumbnail?${params}`,
          { headers }
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
        // Ignore - fallback to icon
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [shareToken, objectKey, fileName, enabled, getAuthToken]);

  return url;
}
