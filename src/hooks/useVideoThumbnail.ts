"use client";

import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";

const VIDEO_EXT =
  /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

// Browser can decode these natively - client-side capture is much faster (byte-range, no server FFmpeg)
const BROWSER_PLAYABLE = /\.(mp4|webm|ogg|mov|m4v|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

function isBrowserPlayable(name: string): boolean {
  return BROWSER_PLAYABLE.test(name.toLowerCase());
}

/**
 * Returns a blob URL for a video thumbnail.
 * For MP4/WebM/MOV: tries client-side first (fast - byte-range, no server round-trip).
 * For ProRes/MXF etc: tries server FFmpeg first.
 */
export function useVideoThumbnail(
  objectKey: string | undefined,
  fileName: string,
  options: { enabled?: boolean } = {}
): string | null {
  const { enabled = true } = options;
  const [url, setUrl] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!objectKey || !isVideoFile(fileName) || !enabled) return;

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
          if (!captureFrame()) {
            videoEl.currentTime = 0;
          }
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

    const tryServerSide = async (token: string): Promise<boolean> => {
      const params = new URLSearchParams({
        object_key: objectKey,
        name: fileName,
      });
      const res = await fetch(`/api/backup/video-thumbnail?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok || cancelled) return false;
      const blob = await res.blob();
      if (cancelled || blob.size === 0) return false;
      setBlobUrl(URL.createObjectURL(blob));
      return true;
    };

    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token || cancelled) return;

        const clientFirst = isBrowserPlayable(fileName);
        const first = clientFirst ? tryClientSide : tryServerSide;
        const second = clientFirst ? tryServerSide : tryClientSide;

        const ok = await first(token);
        if (ok || cancelled) return;
        await second(token);
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
  }, [objectKey, fileName, enabled]);

  return url;
}
