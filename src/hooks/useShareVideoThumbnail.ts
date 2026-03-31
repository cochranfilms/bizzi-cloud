"use client";

import { useEffect, useRef, useState } from "react";
import { withThumbnailSlot } from "@/lib/thumbnailQueue";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";

const BROWSER_PLAYABLE = /\.(mp4|webm|ogg|mov|m4v|3gp)$/i;

function isBrowserPlayable(name: string): boolean {
  return BROWSER_PLAYABLE.test(name.toLowerCase());
}

export interface UseShareVideoThumbnailOptions {
  enabled?: boolean;
  /** For private shares, provide a function to get the auth token */
  getAuthToken?: () => Promise<string | null>;
}

/**
 * Returns a blob URL for a share video thumbnail.
 * For MP4/WebM/MOV: tries client-side first (faster).
 * For ProRes/MXF etc: tries server FFmpeg first.
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
    if (!shareToken || !objectKey || !shouldUseVideoThumbnailPipeline(fileName) || !enabled) return;

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

    const getHeaders = async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {};
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    };

    const tryClientSide = async (headers: Record<string, string>): Promise<boolean> => {
      const streamUrl = await withThumbnailSlot(async () => {
        const streamRes = await fetch(
          `/api/shares/${encodeURIComponent(shareToken)}/video-stream-url`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ object_key: objectKey }),
          }
        );
        if (!streamRes.ok || cancelled) return null;
        const data = (await streamRes.json()) as { streamUrl?: string };
        return data?.streamUrl ?? null;
      });
      if (!streamUrl || cancelled) return false;

      const fullUrl = streamUrl.startsWith("/")
        ? `${window.location.origin}${streamUrl}`
        : streamUrl;

      return new Promise<boolean>((resolve) => {
        videoEl = document.createElement("video");
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.preload = "metadata";
        videoEl.crossOrigin = "anonymous";

        const captureFrame = () => {
          if (cancelled || !videoEl || videoEl.videoWidth === 0) return false;
          try {
            const canvas = document.createElement("canvas");
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) return false;
            ctx.drawImage(videoEl, 0, 0);
            canvas.toBlob(
              (blob) => {
                if (cancelled || !blob) {
                  resolve(false);
                  return;
                }
                setBlobUrl(URL.createObjectURL(blob));
                resolve(true);
              },
              "image/jpeg",
              0.7
            );
            return true;
          } catch {
            return false;
          }
        };

        const onLoadedData = () => {
          if (cancelled || !videoEl) return;
          const seekTo = Math.min(1, (videoEl.duration || 1) * 0.05);
          videoEl.currentTime = seekTo;
        };

        const onSeeked = () => {
          if (!captureFrame()) resolve(false);
        };

        videoEl.addEventListener("loadeddata", onLoadedData, { once: true });
        videoEl.addEventListener("seeked", onSeeked, { once: true });
        videoEl.addEventListener("error", () => resolve(false), { once: true });
        videoEl.src = fullUrl;
      });
    };

    const tryServerSide = async (headers: Record<string, string>): Promise<boolean> => {
      return withThumbnailSlot(async () => {
        const params = new URLSearchParams({
          object_key: objectKey,
          name: fileName,
        });
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        try {
          const res = await fetch(
            `/api/shares/${encodeURIComponent(shareToken)}/video-thumbnail?${params}`,
            { headers, signal: controller.signal }
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
    };

    (async () => {
      try {
        const headers = await getHeaders();
        if (cancelled) return;

        // Server-side first for shares: more reliable for ProRes/Sony/RAW formats
        const ok = await tryServerSide(headers);
        if (ok || cancelled) return;
        await tryClientSide(headers);
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
