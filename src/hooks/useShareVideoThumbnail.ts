"use client";

import { useEffect, useRef, useState } from "react";

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

const BROWSER_PLAYABLE = /\.(mp4|webm|ogg|mov|m4v|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

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

    const getHeaders = async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {};
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      return headers;
    };

    const tryClientSide = async (headers: Record<string, string>): Promise<boolean> => {
      const streamRes = await fetch(
        `/api/shares/${encodeURIComponent(shareToken)}/video-stream-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ object_key: objectKey }),
        }
      );
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
          if (!captureFrame()) videoEl.currentTime = 0;
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
      const params = new URLSearchParams({
        object_key: objectKey,
        name: fileName,
      });
      const res = await fetch(
        `/api/shares/${encodeURIComponent(shareToken)}/video-thumbnail?${params}`,
        { headers }
      );
      if (!res.ok || cancelled) return false;
      const blob = await res.blob();
      if (cancelled || blob.size === 0) return false;
      setBlobUrl(URL.createObjectURL(blob));
      return true;
    };

    (async () => {
      try {
        const headers = await getHeaders();
        if (cancelled) return;

        const clientFirst = isBrowserPlayable(fileName);
        const first = clientFirst ? tryClientSide : tryServerSide;
        const second = clientFirst ? tryServerSide : tryClientSide;

        const ok = await first(headers);
        if (ok || cancelled) return;
        await second(headers);
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
