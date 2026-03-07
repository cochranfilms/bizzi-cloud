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
    let video: HTMLVideoElement | null = null;
    let canvas: HTMLCanvasElement | null = null;

    const cleanup = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
      setUrl(null);
      video?.remove();
      video = null;
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

        await new Promise<void>((resolve, reject) => {
          video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.preload = "metadata";
          video.crossOrigin = "anonymous";

          const onCanPlay = () => {
            if (cancelled) return;
            video!.currentTime = Math.min(1, video!.duration * 0.05);
          };

          const onSeeked = () => {
            if (cancelled || !video) return;
            try {
              canvas = document.createElement("canvas");
              canvas.width = video!.videoWidth;
              canvas.height = video!.videoHeight;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                resolve();
                return;
              }
              ctx.drawImage(video!, 0, 0);
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

          video.addEventListener("canplay", onCanPlay, { once: true });
          video.addEventListener("seeked", onSeeked, { once: true });
          video.addEventListener("error", onError, { once: true });
          video.src = fullUrl;
        });
      } catch {
        // Ignore - fallback to icon
      } finally {
        if (video && !cancelled) {
          video.remove();
        }
      }
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [objectKey, fileName, enabled]);

  return url;
}
