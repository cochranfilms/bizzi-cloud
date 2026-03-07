"use client";

import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase/client";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

/**
 * Captures a frame from a video stream and returns it as a blob URL for use as a thumbnail.
 * Uses a hidden video element to load the stream, seeks to 1s (skips possible black frames),
 * then draws to canvas. Only runs when enabled (e.g. when card is in view).
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
    let canvas: HTMLCanvasElement | null = null;

    const cleanup = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
      videoEl?.remove();
      videoEl = null;
      canvas?.remove();
      canvas = null;
    };

    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken(true);
        if (!token || cancelled) return;

        const res = await fetch("/api/backup/video-stream-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ object_key: objectKey }),
        });
        if (!res.ok || cancelled) return;

        const data = (await res.json()) as { streamUrl?: string };
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
            if (cancelled || !videoEl) return;
            try {
              canvas = document.createElement("canvas");
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
                  const blobUrl = URL.createObjectURL(blob);
                  if (cancelled) {
                    URL.revokeObjectURL(blobUrl);
                    return;
                  }
                  if (urlRef.current) URL.revokeObjectURL(urlRef.current);
                  urlRef.current = blobUrl;
                  setUrl(blobUrl);
                  resolve();
                },
                "image/jpeg",
                0.85
              );
            } catch {
              resolve();
            }
          };

          const onError = () => {
            resolve();
          };

          videoEl.addEventListener("canplay", onCanPlay, { once: true });
          videoEl.addEventListener("seeked", onSeeked, { once: true });
          videoEl.addEventListener("error", onError, { once: true });
          videoEl.src = fullUrl;
        });
      } catch {
        // Ignore - fallback to icon
      } finally {
        const el = videoEl as HTMLVideoElement | null;
        if (el) el.remove();
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [objectKey, fileName, enabled]);

  return url;
}
