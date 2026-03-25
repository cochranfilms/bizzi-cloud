"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Play } from "lucide-react";

const DEFAULT_LOOP_SECONDS = 5;
const SCRUB_IDLE_MS = 220;

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
  /** How thumbnail/video fills the container: cover (crop) or contain (fit) */
  objectFit?: "object-cover" | "object-contain";
  /**
   * When not scrubbing, loop the first N seconds (same default as gallery marquee).
   */
  loopSeconds?: number;
}

/**
 * Video thumbnail: hover loads stream, short segment loops when idle, horizontal scrub previews frames.
 */
export default function VideoScrubThumbnail({
  fetchStreamUrl,
  thumbnailUrl,
  className = "",
  isLoading = false,
  showPlayIcon = true,
  objectFit = "object-cover",
  loopSeconds = DEFAULT_LOOP_SECONDS,
}: VideoScrubThumbnailProps) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [streamLoadFailed, setStreamLoadFailed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [scrubPosition, setScrubPosition] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrubIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringRef = useRef(false);

  useEffect(() => {
    isHoveringRef.current = isHovering;
  }, [isHovering]);

  const clearScrubIdleTimer = useCallback(() => {
    if (scrubIdleTimerRef.current != null) {
      clearTimeout(scrubIdleTimerRef.current);
      scrubIdleTimerRef.current = null;
    }
  }, []);

  const scheduleScrubEnd = useCallback(() => {
    clearScrubIdleTimer();
    scrubIdleTimerRef.current = setTimeout(() => {
      scrubIdleTimerRef.current = null;
      setIsScrubbing(false);
      setScrubPosition(null);
      const v = videoRef.current;
      if (v && isHoveringRef.current) {
        v.currentTime = 0;
        void v.play().catch(() => {});
      }
    }, SCRUB_IDLE_MS);
  }, [clearScrubIdleTimer]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    setIsScrubbing(false);
    setScrubPosition(null);
    clearScrubIdleTimer();
    if (!streamUrl && !isFetching) {
      setIsFetching(true);
      fetchStreamUrl()
        .then((url) => {
          if (url) {
            setStreamUrl(url);
            setStreamLoadFailed(false);
          }
        })
        .finally(() => setIsFetching(false));
    }
  }, [streamUrl, isFetching, fetchStreamUrl, clearScrubIdleTimer]);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    setIsScrubbing(false);
    setScrubPosition(null);
    clearScrubIdleTimer();
    const video = videoRef.current;
    if (video) {
      video.pause();
    }
  }, [clearScrubIdleTimer]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const video = videoRef.current;
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setScrubPosition(pct);

      if (!video || !streamUrl) return;

      setIsScrubbing(true);
      scheduleScrubEnd();

      if (video.readyState >= 1) {
        video.pause();
        if (video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0) {
          video.currentTime = pct * video.duration;
        }
      }
    },
    [streamUrl, scheduleScrubEnd]
  );

  const showVideo = isHovering && streamUrl && !streamLoadFailed;

  /** Loop segment when idle on hover */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo || isScrubbing) return;
    const onTime = () => {
      const dur = v.duration;
      if (!dur || !Number.isFinite(dur)) return;
      const end = Math.min(loopSeconds, dur);
      if (v.currentTime >= end - 0.05) {
        v.currentTime = 0;
      }
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [showVideo, isScrubbing, loopSeconds, streamUrl]);

  /** Start / resume looping playback when not scrubbing */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo || isScrubbing) return;
    v.muted = true;
    if (v.readyState >= 2) {
      if (v.currentTime >= Math.min(loopSeconds, v.duration || loopSeconds) - 0.02) {
        v.currentTime = 0;
      }
      void v.play().catch(() => {});
    }
  }, [showVideo, isScrubbing, loopSeconds, streamUrl]);

  useEffect(() => () => clearScrubIdleTimer(), [clearScrubIdleTimer]);

  const showThumbnail = !showVideo && (thumbnailUrl || isLoading);

  return (
    <div
      ref={containerRef}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-100 dark:bg-neutral-700 ${className}`}
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
          className={`h-full w-full bg-neutral-100 dark:bg-neutral-700 ${objectFit}`}
          onError={() => setStreamLoadFailed(true)}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (!isHoveringRef.current) return;
            if (v.duration && v.duration > 0) {
              v.currentTime = 0;
              void v.play().catch(() => {});
            }
          }}
        />
      ) : showThumbnail ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl ?? ""}
            alt=""
            className={`h-full w-full ${objectFit}`}
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
      {showVideo && scrubPosition !== null && isScrubbing && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
          style={{ left: `${scrubPosition * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
