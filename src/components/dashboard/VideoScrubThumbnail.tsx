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
  /**
   * When false, horizontal hover scrub is disabled so the short loop keeps playing (e.g. public video gallery).
   */
  scrubEnabled?: boolean;
  /**
   * When true, load the stream while the tile is visible (e.g. grid in-view) so the decoded frame can
   * replace a letterboxed poster without waiting for hover.
   */
  eagerLoadStream?: boolean;
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
  scrubEnabled = true,
  eagerLoadStream = false,
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

  const ensureStream = useCallback(() => {
    if (streamUrl || isFetching) return;
    setIsFetching(true);
    fetchStreamUrl()
      .then((url) => {
        if (url) {
          setStreamUrl(url);
          setStreamLoadFailed(false);
        }
      })
      .finally(() => setIsFetching(false));
  }, [streamUrl, isFetching, fetchStreamUrl]);

  useEffect(() => {
    if (!eagerLoadStream || streamUrl || isFetching) return;
    setIsFetching(true);
    fetchStreamUrl()
      .then((url) => {
        if (url) {
          setStreamUrl(url);
          setStreamLoadFailed(false);
        }
      })
      .finally(() => setIsFetching(false));
  }, [eagerLoadStream, streamUrl, isFetching, fetchStreamUrl]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    setIsScrubbing(false);
    setScrubPosition(null);
    clearScrubIdleTimer();
    ensureStream();
  }, [ensureStream, clearScrubIdleTimer]);

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
      if (!scrubEnabled) return;
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
    [streamUrl, scheduleScrubEnd, scrubEnabled]
  );

  const hasStreamReady = !!(streamUrl && !streamLoadFailed);
  const showStreamSurface = hasStreamReady && (isHovering || eagerLoadStream);

  /** Letterboxed API posters + video `poster` fight object-cover; use neutral + decoded frames only. */
  const hideLetterboxedPoster =
    objectFit === "object-cover" &&
    !streamLoadFailed &&
    !hasStreamReady &&
    (eagerLoadStream || isHovering);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showStreamSurface) return;
    if (!isHovering) {
      v.pause();
      v.currentTime = 0;
    }
  }, [showStreamSurface, isHovering, streamUrl]);

  useEffect(() => {
    if (scrubEnabled) return;
    const v = videoRef.current;
    if (!v) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onPause = () => {
      if (!isHoveringRef.current || v.ended) return;
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        if (!isHoveringRef.current || !v.paused || v.ended) return;
        void v.play().catch(() => {});
      }, 60);
    };
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("pause", onPause);
      if (t != null) clearTimeout(t);
    };
  }, [scrubEnabled, streamUrl, showStreamSurface]);

  /** Loop segment when idle on hover */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasStreamReady || !isHovering || isScrubbing) return;
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
  }, [hasStreamReady, isHovering, isScrubbing, loopSeconds, streamUrl]);

  /** Start / resume looping playback when not scrubbing */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !hasStreamReady || !isHovering || isScrubbing) return;
    v.muted = true;
    if (v.readyState >= 2) {
      if (v.currentTime >= Math.min(loopSeconds, v.duration || loopSeconds) - 0.02) {
        v.currentTime = 0;
      }
      void v.play().catch(() => {});
    }
  }, [hasStreamReady, isHovering, isScrubbing, loopSeconds, streamUrl]);

  useEffect(() => () => clearScrubIdleTimer(), [clearScrubIdleTimer]);

  const showThumbnail =
    !showStreamSurface && !hideLetterboxedPoster && (thumbnailUrl || isLoading);

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden bg-neutral-100 dark:bg-neutral-700 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseMove={handleMouseMove}
    >
      {showStreamSurface ? (
        <video
          ref={videoRef}
          src={streamUrl ?? undefined}
          poster={objectFit === "object-cover" ? undefined : thumbnailUrl ?? undefined}
          muted
          playsInline
          preload={eagerLoadStream ? "auto" : "metadata"}
          className={`pointer-events-none absolute inset-0 h-full w-full bg-neutral-900 ${objectFit}`}
          onError={() => setStreamLoadFailed(true)}
          onEnded={(e) => {
            const v = e.currentTarget;
            if (!isHoveringRef.current) return;
            v.currentTime = 0;
            void v.play().catch(() => {});
          }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.duration && v.duration > 0) {
              v.currentTime = 0;
            }
            if (isHoveringRef.current && v.duration && v.duration > 0) {
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
            className={`pointer-events-none absolute inset-0 h-full w-full ${objectFit}`}
          />
        </>
      ) : hideLetterboxedPoster ? (
        <div className="pointer-events-none absolute inset-0 bg-neutral-900" aria-hidden />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <Film className="h-8 w-8 text-neutral-500 dark:text-neutral-400" />
        </div>
      )}
      {showPlayIcon &&
        (showStreamSurface || showThumbnail || isLoading || hideLetterboxedPoster) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </div>
        </div>
      )}
      {showStreamSurface && scrubPosition !== null && isScrubbing && (
        <div
          className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]"
          style={{ left: `${scrubPosition * 100}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}
