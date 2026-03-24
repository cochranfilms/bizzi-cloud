"use client";

import { useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";

const DEFAULT_LOOP_SEC = 5;

export interface LoopingVideoPreviewProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  /** Seconds to loop (from t=0). Clamped to video duration when shorter. */
  loopSeconds?: number;
}

/**
 * Muted autoplay preview: loops the first N seconds of the source (full ladder for Mux HLS).
 * Wires hls.js when src is an HLS playlist.
 */
export default function LoopingVideoPreview({
  src,
  className = "",
  style,
  loopSeconds = DEFAULT_LOOP_SEC,
}: LoopingVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isHls = src.includes(".m3u8");
    if (isHls && Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = new Hls({
        maxMaxBufferLength: 20,
        startLevel: -1,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    if (!isHls) {
      video.src = src;
      return () => {
        video.removeAttribute("src");
        video.load();
      };
    }
    return undefined;
  }, [src]);

  const onTimeUpdate = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration;
    if (!dur || !Number.isFinite(dur) || dur <= 0) return;
    const end = Math.min(loopSeconds, dur);
    if (v.currentTime >= end - 0.05) {
      v.currentTime = 0;
    }
  }, [loopSeconds]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [onTimeUpdate, src]);

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      preload="metadata"
      className={className}
      style={style}
    />
  );
}
