"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

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
 * 1. Tries server-side FFmpeg first
 * 2. Falls back to client-side canvas capture for browser-playable formats
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
    let videoEl: HTMLVideoElement | null = null;

    const setBlobUrl = (blobUrl: string) => {
      if (cancelled) {
        URL.revokeObjectURL(blobUrl);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = blobUrl;
      setUrl(blobUrl);
    };

    const cleanup = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
      videoEl?.remove();
      videoEl = null;
    };

    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const token = await getAuthToken();
          if (token) headers.Authorization = `Bearer ${token}`;
        }
        if (cancelled) return;

        // 1. Try server-side FFmpeg thumbnail
        const params = new URLSearchParams({
          object_key: objectKey,
          name: fileName,
        });
        const res = await fetch(
          `/api/shares/${encodeURIComponent(shareToken)}/video-thumbnail?${params}`,
          { headers }
        );

        if (res.ok && !cancelled) {
          const blob = await res.blob();
          if (!cancelled && blob.size > 0) {
            setBlobUrl(URL.createObjectURL(blob));
            return;
          }
        }

        // 2. Fallback: client-side capture
        if (cancelled) return;
        const streamRes = await fetch(
          `/api/shares/${encodeURIComponent(shareToken)}/video-stream-url`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ object_key: objectKey }),
          }
        );
        if (!streamRes.ok || cancelled) return;

        const data = (await streamRes.json()) as { streamUrl?: string };
        const streamUrl = data?.streamUrl;
        if (!streamUrl || cancelled) return;

        const fullUrl = streamUrl.startsWith("/")
          ? `${window.location.origin}${streamUrl}`
          : streamUrl;

        await new Promise<void>((resolve) => {
          videoEl = document.createElement("video");
          videoEl.muted = true;
          videoEl.playsInline = true;
          videoEl.preload = "metadata";
          videoEl.crossOrigin = "anonymous";

          const onCanPlay = () => {
            if (cancelled) return;
            videoEl!.currentTime = Math.min(1, videoEl!.duration * 0.05);
          };

          const onSeeked = () => {
            if (cancelled || !videoEl) {
              resolve();
              return;
            }
            try {
              const canvas = document.createElement("canvas");
              canvas.width = videoEl!.videoWidth;
              canvas.height = videoEl!.videoHeight;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve();
                return;
              }
              ctx.drawImage(videoEl!, 0, 0);
              canvas.toBlob(
                (blob) => {
                  if (cancelled || !blob) {
                    resolve();
                    return;
                  }
                  setBlobUrl(URL.createObjectURL(blob));
                  resolve();
                },
                "image/jpeg",
                0.85
              );
            } catch {
              resolve();
            }
          };

          videoEl.addEventListener("canplay", onCanPlay, { once: true });
          videoEl.addEventListener("seeked", onSeeked, { once: true });
          videoEl.addEventListener("error", () => resolve(), { once: true });
          videoEl.src = fullUrl;
        });
      } catch {
        // Both paths failed - placeholder will show
      } finally {
        (videoEl as HTMLVideoElement | null)?.remove();
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [shareToken, objectKey, fileName, enabled, getAuthToken]);

  return url;
}
