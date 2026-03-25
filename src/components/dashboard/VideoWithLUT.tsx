"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import { Pause, Play, Volume2, VolumeX, Maximize } from "lucide-react";
import Hls from "hls.js";
import {
  createVideoLUTContext,
  createLUTTexture,
  renderVideoFrameWithLUT,
  type VideoLUTContext,
} from "@/lib/creative-lut/video-lut-engine";
import { getOrLoadLUT } from "@/lib/creative-lut/lut-cache";

export interface LUTOption {
  id: string;
  name: string;
  /** Source for loading: builtin id (e.g. sony_rec709) or signed URL for custom LUT */
  source: string;
  isBuiltin?: boolean;
}

interface VideoWithLUTProps {
  src: string;
  streamUrl?: string | null;
  className?: string;
  /** Applied to the underlying &lt;video&gt; (e.g. objectPosition for cover crops). */
  videoStyle?: CSSProperties;
  /** When false, LUT controls are hidden and video plays without LUT. Default: false. */
  showLUTOption?: boolean;
  /** URL (signed) or builtin LUT id (e.g. sony_rec709). When null and showLUTOption, defaults to sony_rec709. */
  lutSource?: string | null;
  /** Available LUTs for dropdown. Builtin + custom from library. */
  lutOptions?: LUTOption[];
  /** Called when LUT is toggled on/off. */
  onLutChange?: (enabled: boolean) => void;
  /** Called when user selects a different LUT from dropdown. */
  onLutSelect?: (lutId: string) => void;
  /** When set, overrides internal LUT on/off (e.g. gallery “Creative preview” toggle). */
  creativePreviewOn?: boolean;
  /** Hide transport bar; use for grid tiles. */
  compactPreview?: boolean;
  /** Loop first N seconds (muted tile previews). */
  segmentLoopSeconds?: number | null;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoWithLUT({
  src,
  streamUrl,
  className,
  videoStyle,
  showLUTOption = false,
  lutSource = null,
  lutOptions = [],
  onLutChange,
  onLutSelect,
  creativePreviewOn,
  compactPreview = false,
  segmentLoopSeconds = null,
}: VideoWithLUTProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const videoSrc = streamUrl ?? src;

  const defaultSony = "sony_rec709";
  const effectiveLutSource = lutSource ?? (showLUTOption ? defaultSony : null);

  const [lutEnabled, setLutEnabled] = useState(true);
  const [selectedLutId, setSelectedLutId] = useState<string | null>(null);
  const [lutReady, setLutReady] = useState(false);
  const [lutError, setLutError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const glRef = useRef<VideoLUTContext | null>(null);

  const options =
    lutOptions.length > 0
      ? lutOptions
      : [{ id: defaultSony, name: "Sony Rec 709", source: defaultSony, isBuiltin: true }];

  const previewOn =
    creativePreviewOn !== undefined ? creativePreviewOn : lutEnabled;

  const currentLutSource: string | null = !previewOn
    ? null
    : lutOptions.length > 0
      ? (() => {
          const id = selectedLutId ?? options[0]?.id;
          const opt = options.find((o) => o.id === id);
          return opt?.source && opt.source.length > 0 ? opt.source : null;
        })()
      : effectiveLutSource ?? null;

  useEffect(() => {
    if (lutOptions.length === 0) {
      setSelectedLutId(null);
      return;
    }
    setSelectedLutId((prev) => {
      if (prev && lutOptions.some((o) => o.id === prev)) return prev;
      return lutOptions[0]?.id ?? null;
    });
  }, [lutOptions]);

  useEffect(() => {
    if (!previewOn || !currentLutSource) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext("webgl2", { alpha: true });
    if (!gl) {
      setError("WebGL2 not supported");
      return;
    }

    let cancelled = false;
    getOrLoadLUT(currentLutSource)
      .then(({ data, size }) => {
        if (cancelled) return;
        const lutTexture = createLUTTexture(gl, data, size);
        glRef.current = createVideoLUTContext(gl, lutTexture, size);
        setLutReady(true);
        setLutError(null);
      })
      .catch((e) => {
        if (!cancelled) {
          setLutError(e instanceof Error ? e.message : "LUT load failed");
          setLutReady(false);
        }
      });

    return () => {
      cancelled = true;
      const ctx = glRef.current;
      if (ctx) {
        ctx.gl.deleteTexture(ctx.videoTexture);
        ctx.gl.deleteTexture(ctx.lutTexture);
        ctx.gl.deleteProgram(ctx.program);
        glRef.current = null;
      }
      setLutReady(false);
    };
  }, [previewOn, currentLutSource]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    const ctx = glRef.current;
    if (!canvas || !video || !container || !ctx || !lutReady) return;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!containerRect || vw <= 0 || vh <= 0) return;

      const scale = Math.min(videoRect.width / vw, videoRect.height / vh);
      const contentW = vw * scale;
      const contentH = vh * scale;
      const contentLeft = videoRect.left + (videoRect.width - contentW) / 2;
      const contentTop = videoRect.top + (videoRect.height - contentH) / 2;

      const w = Math.max(1, Math.floor(contentW * dpr));
      const h = Math.max(1, Math.floor(contentH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }

      Object.assign(canvas.style, {
        position: "absolute",
        left: `${contentLeft - containerRect.left}px`,
        top: `${contentTop - containerRect.top}px`,
        width: `${contentW}px`,
        height: `${contentH}px`,
      });
    };

    let rafId = 0;
    let cancelled = false;

    const render = () => {
      if (cancelled) return;
      if (video.readyState < 2) {
        rafId = requestAnimationFrame(render);
        return;
      }
      resize();
      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) {
        rafId = requestAnimationFrame(render);
        return;
      }
      if (cancelled) return;

      renderVideoFrameWithLUT(ctx, video, w, h, !!currentLutSource && previewOn);

      if (!cancelled) rafId = requestAnimationFrame(render);
    };

    const onResize = () => resize();
    const onFullscreenChange = () => requestAnimationFrame(resize);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    video.addEventListener("loadeddata", render);
    if (video.readyState >= 2) render();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      video.removeEventListener("loadeddata", render);
    };
  }, [previewOn, lutReady, currentLutSource]);

  const handleLUTToggle = useCallback(() => {
    setLutEnabled((v) => {
      const next = !v;
      onLutChange?.(next);
      return next;
    });
  }, [onLutChange]);

  const handleLUTSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const id = e.target.value;
      if (!id) return;
      setSelectedLutId(id);
      onLutSelect?.(id);
    },
    [onLutSelect]
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("volumechange", onVolumeChange);
    setCurrentTime(video.currentTime);
    setDuration(video.duration);
    setVolume(video.volume);
    setIsMuted(video.muted);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("volumechange", onVolumeChange);
    };
  }, []);

  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    const bar = e.currentTarget;
    if (!video || !bar || !Number.isFinite(video.duration)) return;
    const rect = bar.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    video.currentTime = frac * video.duration;
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleVideoError = useCallback(() => {
    setError((prev) =>
      prev ??
        "Video failed to load. The preview link may have expired — try closing and reopening."
    );
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    setError(null);
    video.addEventListener("error", handleVideoError);
    return () => video.removeEventListener("error", handleVideoError);
  }, [videoSrc, handleVideoError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const isHls = videoSrc.includes(".m3u8");
    if (isHls && Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(videoSrc);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoSrc;
      return () => {
        video.src = "";
      };
    }
    if (!isHls) {
      video.src = videoSrc;
      return () => {
        video.src = "";
      };
    }
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segmentLoopSeconds || segmentLoopSeconds <= 0) return;
    const sec = segmentLoopSeconds;
    const onTimeUpdate = () => {
      const dur = video.duration;
      if (!dur || !Number.isFinite(dur)) return;
      const end = Math.min(sec, dur);
      if (video.currentTime >= end - 0.06) {
        video.currentTime = 0;
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    return () => video.removeEventListener("timeupdate", onTimeUpdate);
  }, [segmentLoopSeconds, videoSrc]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-red-100 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-400">
        <p className="text-sm">{error}</p>
        <video
          ref={videoRef}
          src={!videoSrc?.includes(".m3u8") ? videoSrc : undefined}
          crossOrigin="anonymous"
          controls
          preload="metadata"
          className={className}
        />
      </div>
    );
  }

  const containerStyle: React.CSSProperties = compactPreview
    ? { width: "100%", height: "100%", minHeight: 0 }
    : isFullscreen
      ? { width: "100vw", height: "100vh", maxHeight: "100vh" }
      : {
          maxHeight: "70vh",
          aspectRatio: "16 / 9",
        };


  return (
    <div
      className={
        compactPreview
          ? "h-full w-full min-h-0"
          : "flex w-full flex-col items-center gap-4"
      }
    >
      <div
        ref={containerRef}
        className={`video-fullscreen-container relative w-full max-w-full overflow-hidden bg-neutral-200 dark:bg-black ${
          compactPreview
            ? "rounded-lg"
            : "rounded-xl shadow-xl ring-1 ring-neutral-200 dark:ring-neutral-700/50"
        }`}
        style={containerStyle}
      >
        <video
          ref={videoRef}
          src={!videoSrc.includes(".m3u8") ? videoSrc : undefined}
          crossOrigin="anonymous"
          controls={false}
          preload="metadata"
          playsInline
          muted={compactPreview ? true : undefined}
          autoPlay={compactPreview ? true : undefined}
          style={videoStyle}
          className={
            compactPreview
              ? `h-full w-full object-cover ${className ?? ""}`
              : `max-w-full w-full h-full object-contain ${className ?? ""} ${isFullscreen ? "!max-h-none min-h-full" : "max-h-[70vh]"}`
          }
        />
        {previewOn && currentLutSource && (
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 transition-opacity duration-200"
            style={{
              pointerEvents: "none",
              opacity: lutReady && !lutError ? 1 : 0,
            }}
          />
        )}
        {!compactPreview && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-200">
          <div
            className="h-1.5 cursor-pointer rounded-full bg-white/20 backdrop-blur-sm"
            onClick={handleProgressClick}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={currentTime}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-bizzi-blue to-bizzi-cyan shadow-lg shadow-bizzi-blue/30 transition-[width]"
              style={{
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={togglePlayPause}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-bizzi-blue/30 hover:text-white"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
              )}
            </button>
            <span className="min-w-[4.5rem] text-sm font-medium text-white/95 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              type="button"
              onClick={toggleMute}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/20 hover:text-white"
              aria-label={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/20 hover:text-white"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>
        )}
      </div>
      {showLUTOption && (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/60">
          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleLUTToggle}
              className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                lutEnabled
                  ? "bg-gradient-to-r from-bizzi-blue to-bizzi-cyan text-white shadow-lg shadow-bizzi-blue/20"
                  : "bg-neutral-200 text-neutral-600 ring-1 ring-neutral-300 transition-colors hover:bg-neutral-300 hover:ring-neutral-400 dark:bg-neutral-700/50 dark:text-neutral-300 dark:ring-neutral-600/50 dark:hover:bg-neutral-600/60 dark:hover:ring-neutral-500"
              }`}
              title="WebGL texture read requires video origin CORS. If preview is black, add CORS to your B2 bucket."
            >
              <span
                className={`inline-block h-3 w-3 rounded-full border-2 transition-colors ${
                  lutEnabled
                    ? "border-white bg-white"
                    : "border-neutral-400 bg-transparent dark:border-neutral-500"
                }`}
              />
              Creative LUT {lutEnabled ? "On" : "Off"}
            </button>
            {lutEnabled && options.length > 0 && (
              <select
                value={selectedLutId ?? options[0]?.id ?? defaultSony}
                onChange={handleLUTSelect}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
              >
                {options.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {lutError && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              LUT preview unavailable. Playing original video.
            </p>
          )}
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            <span className={lutEnabled ? "font-medium text-bizzi-blue dark:text-bizzi-cyan" : ""}>
              {lutEnabled ? "On" : "Off"}
            </span>
            {" · "}For S-Log3 / Sony RAW. Preview only; originals unchanged.
          </span>
        </div>
      )}
    </div>
  );
}
