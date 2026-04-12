"use client";

import { useEffect, useRef, useState } from "react";
import { getAuthToken } from "@/lib/auth-token";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";
import { withThumbnailSlot } from "@/lib/thumbnailQueue";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";

/**
 * Returns a blob URL for a video thumbnail.
 * Always tries server first (cache hit on repeat views, optimized FFmpeg on first).
 * Falls back to client-side capture if server fails.
 */
export function useVideoThumbnail(
  objectKey: string | undefined,
  fileName: string,
  options: { enabled?: boolean; isVideo?: boolean; posterRev?: number } = {}
): string | null {
  const { enabled = true, isVideo: isVideoOverride = false, posterRev = 0 } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    const isVideo =
      !isAppleDoubleLeafName(fileName) &&
      (isVideoOverride || shouldUseVideoThumbnailPipeline(fileName));
    if (!objectKey || !isVideo || !enabled) return;

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

    const tryClientSide = async (token: string): Promise<boolean> => {
      const streamRes = await fetch("/api/backup/video-stream-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ object_key: objectKey }),
      });
      if (!streamRes.ok || cancelled) return false;

      const data = (await streamRes.json()) as { streamUrl?: string };
      const streamUrl = data?.streamUrl;
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

    const tryServerSide = async (
      token: string
    ): Promise<{ ok: boolean; unauthorized?: boolean }> => {
      const result = await withThumbnailSlot(async () => {
        const params = new URLSearchParams({
          object_key: objectKey,
          name: fileName,
        });
        if (posterRev > 0) {
          params.set("_rev", String(posterRev));
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);
        try {
          const res = await fetch(`/api/backup/video-thumbnail?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.status === 401)
            return { ok: false, unauthorized: true };
          if (!res.ok || cancelled) return { ok: false, unauthorized: false };
          const blob = await res.blob();
          if (cancelled || blob.size === 0)
            return { ok: false, unauthorized: false };
          setBlobUrl(URL.createObjectURL(blob));
          return { ok: true, unauthorized: false };
        } catch {
          clearTimeout(timeoutId);
          return { ok: false, unauthorized: false };
        }
      });
      return result ?? { ok: false, unauthorized: false };
    };

    (async () => {
      try {
        // Use cached token (getIdToken(false)) to avoid refresh storm when many thumbnails load
        let token = await getAuthToken(false);
        if (!token || cancelled) return;

        // Always try server first: hits cache on repeat views, optimized FFmpeg on first
        let result = await tryServerSide(token);
        if (result.unauthorized && !cancelled) {
          const fresh = await getAuthToken(true);
          if (fresh) {
            token = fresh;
            result = await tryServerSide(fresh);
          }
        }
        if (result.ok || cancelled) return;
        await tryClientSide(token);
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
  }, [objectKey, fileName, enabled, isVideoOverride, posterRev]);

  return url;
}
