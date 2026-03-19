"use client";

import { useCallback, useRef, useState } from "react";
import { Film, Play } from "lucide-react";

interface VideoScrubThumbnailProps {
  /** Async function to fetch the video stream URL. Called on first hover. */
  fetchStreamUrl: () => Promise<string | null>;
  /** Fallback thumbnail URL (from useVideoThumbnail or similar) */
  thumbnailUrl: string | null;
  /** Container className */
  className?: string;
  /** Whether the video is loading or failed */
  isLoading?: boolean;
  /** Show play icon overlay */
  showPlayIcon?: boolean;
}

/**
 * Video thumbnail that allows scrubbing on hover. Users can move the cursor
 * across the thumbnail to preview different frames without clicking.
 */
export default function VideoScrubThumbnail({
  fetchStreamUrl,
  thumbnailUrl,
  className = "",
  isLoading = false,
  showPlayIcon = true,
}: VideoScrubThumbnailProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (!streamUrl && !isFetching) {
      setIsFetching(true);
      fetchStreamUrl()
        .then((url) => {
          if (url) setStreamUrl(url);
        })
        .finally(() => setIsFetching(false));
    }
  }, [streamUrl, isFetching, fetchStreamUrl]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setScrubPosition(null);
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setScrubPosition(pct);

      if (video && streamUrl && video.readyState >= 2) {
        const time = pct * (video.duration || 0);
        video.currentTime = time;
      }
    },
    [streamUrl]
  );

  const showVideo = isHovering && streamUrl;
  const showThumbnail = !showVideo && (thumbnailUrl || isLoading);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {showVideo ? (
        <video
          ref={videoRef}
          src={streamUrl}
          muted
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.duration && v.duration > 0) {
              v.currentTime = v.duration * 0.05;
            }
          }}
        />
      ) : showThumbnail ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl ?? ""}
            alt=""
            className="h-full w-full object-cover"
          />
        </>
      ) : (
        <Film className="h-8 w-8 text-neutral-500 dark:text-neutral-400" />
      )}
      {showPlayIcon && (showVideo || showThumbnail || isLoading) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </div>
        </div>
      )}
      {showVideo && scrubPosition !== null && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
          style={{ left: `${scrubPosition * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
