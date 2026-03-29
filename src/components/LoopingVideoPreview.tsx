"use client";

import { useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import { createGalleryHlsInstance } from "@/lib/hls-gallery-player";

const DEFAULT_LOOP_SEC = 5;

export type LoopingVideoPreviewMode = "segment" | "fullLoop" | "playOnce";

export interface LoopingVideoPreviewProps {
  src: string;
  className?: string;
  style?: React.CSSProperties;
  /** Prefer top HLS ladder rung (large heroes); avoids blurry banner when ABR never upgrades. */
  preferMaxHlsQuality?: boolean;
  /** Seconds to loop (from t=0). Clamped to video duration when shorter. Only used when mode is "segment". */
  loopSeconds?: number;
  /**
   * segment — loop the first `loopSeconds` via seeks (gallery-style).
   * fullLoop — native loop over the entire clip (no seek-to-zero stutter).
   * playOnce — play once and stay on the last frame.
   */
  mode?: LoopingVideoPreviewMode;
}

/**
 * Muted autoplay preview: loops the first N seconds of the source (full ladder for Mux HLS).
 * Wires hls.js when src is an HLS playlist.
 */
export default function LoopingVideoPreview({
  src,
  className = "",
  style,
  preferMaxHlsQuality = false,
  loopSeconds = DEFAULT_LOOP_SEC,
  mode = "segment",
}: LoopingVideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    const isHls = src.includes(".m3u8");
    if (isHls && Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = createGalleryHlsInstance({
        preferMaxQuality: preferMaxHlsQuality,
        maxBufferDefault: 20,
        maxBufferTopRung: 60,
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
  }, [src, preferMaxHlsQuality]);

  /** Muted autoplay is flaky with many decoders; reinforce after src/mode settles. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v || mode === "segment") return;
    const kick = () => {
      void v.play().catch(() => {});
    };
    if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) kick();
    else v.addEventListener("canplay", kick, { once: true });
    return () => v.removeEventListener("canplay", kick);
  }, [src, mode]);

  const onTimeUpdate = useCallback(() => {
    if (mode !== "segment") return;
    const v = videoRef.current;
    if (!v) return;
    const dur = v.duration;
    if (!dur || !Number.isFinite(dur) || dur <= 0) return;
    const end = Math.min(loopSeconds, dur);
    if (v.currentTime >= end - 0.05) {
      v.currentTime = 0;
    }
  }, [loopSeconds, mode]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || mode !== "segment") return;
    v.addEventListener("timeupdate", onTimeUpdate);
    return () => v.removeEventListener("timeupdate", onTimeUpdate);
  }, [onTimeUpdate, src, mode]);

  const onEnded = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (mode !== "playOnce") return;
      const v = e.currentTarget;
      // Do not seek after `ended`; rewinding a few frames often blanks the layer
      // (Chrome/WebKit) when the marquee parent uses CSS transform.
      v.pause();
    },
    [mode],
  );

  const preload = mode === "segment" ? "metadata" : "auto";

  /** Own compositing layer — video inside transformed ancestors often renders black otherwise. */
  const layerStyle: React.CSSProperties =
    mode === "segment"
      ? {}
      : {
          transform: "translate3d(0, 0, 0)",
          WebkitTransform: "translate3d(0, 0, 0)",
        };

  const mergedStyle = style ? { ...layerStyle, ...style } : layerStyle;

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      loop={mode === "fullLoop"}
      preload={preload}
      className={className}
      style={mergedStyle}
      onEnded={mode === "playOnce" ? onEnded : undefined}
    />
  );
}
