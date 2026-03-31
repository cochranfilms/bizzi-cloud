"use client";

import {
  useRef,
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  type CSSProperties,
  type SyntheticEvent,
} from "react";
import { Pause, Play, Volume2, VolumeX, Maximize } from "lucide-react";
import Hls from "hls.js";
import { createGalleryHlsInstance } from "@/lib/hls-gallery-player";
import {
  createVideoLUTContext,
  disposeVideoLUTContext,
  renderVideoFrameWithLUT,
  setSecondaryVideoLut,
  swapPrimarySecondaryVideoLut,
  type VideoLUTContext,
} from "@/lib/creative-lut/video-lut-engine";
import { getOrLoadLUT } from "@/lib/creative-lut/lut-cache";
import {
  canRenderVideoToWebGL,
  type VideoWebglEligibility,
} from "@/lib/creative-lut/video-webgl-eligibility";
import { filePreviewLutDebugEnabled } from "@/lib/file-preview-lut-debug";
import { isGalleryVideoDebugEnabled } from "@/lib/gallery-video-debug";
import { logGalleryLutEvent } from "@/lib/gallery-lut-telemetry";

/** Normalized UV crop for object-cover (visible region of video texture). */
function videoCoverTextureCrop(
  elementW: number,
  elementH: number,
  videoW: number,
  videoH: number
): [number, number, number, number] {
  if (videoW <= 0 || videoH <= 0 || elementW <= 0 || elementH <= 0) {
    return [0, 0, 1, 1];
  }
  const arVideo = videoW / videoH;
  const arElem = elementW / elementH;
  if (arElem > arVideo) {
    const vSpan = arVideo / arElem;
    const v0 = (1 - vSpan) / 2;
    return [0, v0, 1, v0 + vSpan];
  }
  const uSpan = arElem / arVideo;
  const u0 = (1 - uSpan) / 2;
  return [u0, 0, u0 + uSpan, 1];
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Dev: set `NEXT_PUBLIC_BYPASS_VIDEO_WEBGL_SAMPLING=1` to force LUT draw path (isolates probe vs resolver). */
function bypassVideoWebglSamplingGate(): boolean {
  return process.env.NEXT_PUBLIC_BYPASS_VIDEO_WEBGL_SAMPLING === "1";
}

function galleryLutDevHudEnabled(): boolean {
  return process.env.NODE_ENV === "development" || isGalleryVideoDebugEnabled();
}

function videoHlsDiagEnabled(): boolean {
  return filePreviewLutDebugEnabled() || isGalleryVideoDebugEnabled();
}

/** Blend time between two 3D LUTs in the shader (dual-LUT crossfade). */
const VIDEO_LUT_CROSSFADE_MS = 520;
/** Fade the graded canvas in/out so preview / Original toggles do not blink. */
const GRADE_LAYER_FADE_MS = 420;

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
  /** Immersive viewer: no heavy frame / ring around the video */
  frameless?: boolean;
  /** With showLUTOption, place LUT toolbar beside the video on large screens */
  sideBySideLut?: boolean;
  /** Fired once when the video has decoded frames and dimensions (for preview fade-in). */
  onDisplayReady?: () => void;
  /**
   * For large heroes / backdrops with HLS: start at the highest rung so ABR does not stick on a
   * tiny preview ladder (short loops can prevent ever upgrading). Grid tiles should leave this off.
   */
  preferMaxHlsQuality?: boolean;
  /** Optional still shown until first frame (helps hero continuity on source swap). */
  poster?: string | null;
  /** Match WebGL sampling to visible &lt;video&gt; (hero uses cover). Default contain / letterbox. */
  videoObjectFit?: "contain" | "cover";
  /** Fired when intrinsic width/height are known (Creator RAW reel detection). */
  onIntrinsicVideoSize?: (width: number, height: number) => void;
  /**
   * Creator RAW immersive: only attach remote playback from `streamUrl` / HLS — no `src` fallback,
   * preload none until a stream exists (avoids accidental original fetches).
   */
  proxyOnlyPlayback?: boolean;
  /** With ?galleryVideoDebug or localStorage galleryVideoDebug=1, logs playback diagnostics. */
  playbackDebugLabel?: string;
  /**
   * Public gallery: parent owns apply/source — use `shouldApplyLut` + `lutSource` only.
   * Skips internal lutOptions dropdown resolution.
   */
  galleryControlledLut?: boolean;
  /** With `galleryControlledLut`, whether to show the grade (parent-resolved). */
  shouldApplyLut?: boolean;
  lutTelemetrySurface?: "hero" | "grid" | "modal";
  lutTelemetryGalleryId?: string;
  lutTelemetryPasswordProtected?: boolean;
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
  frameless = false,
  sideBySideLut = false,
  onDisplayReady,
  preferMaxHlsQuality = false,
  poster = null,
  videoObjectFit = "contain",
  onIntrinsicVideoSize,
  proxyOnlyPlayback = false,
  playbackDebugLabel,
  galleryControlledLut = false,
  shouldApplyLut = false,
  lutTelemetrySurface,
  lutTelemetryGalleryId,
  lutTelemetryPasswordProtected,
}: VideoWithLUTProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const displayReadyFiredRef = useRef(false);
  const prevGalleryStreamRef = useRef<string | null>(null);
  /** HLS / parent effects trigger the same deferred WebGL probe (gallery-controlled path). */
  const webglProbeTriggerRef = useRef<(() => void) | null>(null);
  /** Dev HUD: last time `renderVideoFrameWithLUT` ran (gallery diagnostic). */
  const lastLutRenderFrameAtRef = useRef(0);
  const videoSrc = proxyOnlyPlayback ? (streamUrl ?? "") : (streamUrl ?? src);

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
  const displayedLutUrlRef = useRef<string | null>(null);
  const lutCrossfadeRef = useRef(0);
  const lutTransitionRafRef = useRef<number | null>(null);
  /** CSS opacity for the WebGL layer (preview off = fade out before dispose). */
  const [gradeLayerOpacity, setGradeLayerOpacity] = useState(1);
  /**
   * Gallery-only: whether `texImage2D` from the video succeeds. `unknown` keeps the LUT shader path
   * on until a probe completes — avoids a single early failure disabling grading for the whole clip.
   */
  const [videoWebglEligibility, setVideoWebglEligibility] =
    useState<VideoWebglEligibility>("ok");

  const options =
    lutOptions.length > 0
      ? lutOptions
      : [{ id: defaultSony, name: "Sony Rec 709", source: defaultSony, isBuiltin: true }];

  const previewOn = galleryControlledLut
    ? shouldApplyLut
    : creativePreviewOn !== undefined
      ? creativePreviewOn
      : lutEnabled;

  const currentLutSource: string | null = galleryControlledLut
    ? shouldApplyLut && lutSource
      ? lutSource
      : null
    : !previewOn
      ? null
      : lutOptions.length > 0
        ? (() => {
            const id = selectedLutId ?? options[0]?.id;
            const opt = options.find((o) => o.id === id);
            return opt?.source && opt.source.length > 0 ? opt.source : null;
          })()
        : effectiveLutSource ?? null;

  /** Final flag passed to `renderVideoFrameWithLUT` (`unknown` does not disable grading). */
  const lutEnabledInShader =
    !!currentLutSource &&
    previewOn &&
    (!galleryControlledLut ||
      bypassVideoWebglSamplingGate() ||
      videoWebglEligibility !== "failed");

  useEffect(() => {
    if (galleryControlledLut) return;
    if (lutOptions.length === 0) {
      setSelectedLutId(null);
      return;
    }
    setSelectedLutId((prev) => {
      if (prev && lutOptions.some((o) => o.id === prev)) return prev;
      return lutOptions[0]?.id ?? null;
    });
  }, [lutOptions, galleryControlledLut]);

  /** Full teardown when stream identity changes (gallery): avoid stale HLS/WebGL after Mux swap. */
  useEffect(() => {
    if (!galleryControlledLut) {
      prevGalleryStreamRef.current = videoSrc;
      return;
    }
    const prev = prevGalleryStreamRef.current;
    if (prev === null) {
      prevGalleryStreamRef.current = videoSrc;
      return;
    }
    if (prev === videoSrc) return;
    prevGalleryStreamRef.current = videoSrc;
    logGalleryLutEvent("gallery_video_stream_swapped", {
      galleryId: lutTelemetryGalleryId,
      surface: lutTelemetrySurface,
      passwordProtected: lutTelemetryPasswordProtected,
      streamUrlSample: videoSrc.length > 120 ? `${videoSrc.slice(0, 120)}…` : videoSrc,
    });
    logGalleryLutEvent("gallery_video_lut_context_reinitialized", {
      galleryId: lutTelemetryGalleryId,
      surface: lutTelemetrySurface,
    });
    /* HLS lifecycle stays in the dedicated effect below (avoids double destroy). */
    if (lutTransitionRafRef.current != null) {
      cancelAnimationFrame(lutTransitionRafRef.current);
      lutTransitionRafRef.current = null;
    }
    if (glRef.current) {
      disposeVideoLUTContext(glRef.current);
      glRef.current = null;
    }
    displayedLutUrlRef.current = null;
    lutCrossfadeRef.current = 0;
    setLutReady(false);
    setLutError(null);
    setGradeLayerOpacity(1);
    setVideoWebglEligibility("unknown");
    lastLutRenderFrameAtRef.current = 0;
  }, [
    videoSrc,
    galleryControlledLut,
    lutTelemetryGalleryId,
    lutTelemetrySurface,
    lutTelemetryPasswordProtected,
  ]);

  useEffect(() => {
    if (!galleryControlledLut) {
      setVideoWebglEligibility("ok");
      webglProbeTriggerRef.current = null;
      return;
    }
    if (!previewOn || !currentLutSource) {
      setVideoWebglEligibility("ok");
      webglProbeTriggerRef.current = null;
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setVideoWebglEligibility("unknown");
      webglProbeTriggerRef.current = null;
      return;
    }

    setVideoWebglEligibility("unknown");

    let cancelled = false;
    let raf1: number | null = null;
    let raf2: number | null = null;

    const clearRaf = () => {
      if (raf1 != null) {
        cancelAnimationFrame(raf1);
        raf1 = null;
      }
      if (raf2 != null) {
        cancelAnimationFrame(raf2);
        raf2 = null;
      }
    };

    const runProbe = () => {
      if (cancelled) return;
      if (
        video.readyState < 2 ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        return;
      }
      clearRaf();
      raf1 = requestAnimationFrame(() => {
        raf1 = null;
        if (cancelled) return;
        raf2 = requestAnimationFrame(() => {
          raf2 = null;
          if (cancelled) return;
          if (
            video.readyState < 2 ||
            video.videoWidth <= 0 ||
            video.videoHeight <= 0
          ) {
            return;
          }
          const ok = canRenderVideoToWebGL(video);
          setVideoWebglEligibility(ok ? "ok" : "failed");
          if (!ok) {
            logGalleryLutEvent("gallery_video_texture_upload_failed", {
              galleryId: lutTelemetryGalleryId,
              surface: lutTelemetrySurface,
              passwordProtected: lutTelemetryPasswordProtected,
            });
            logGalleryLutEvent("gallery_video_lut_disabled_fallback", {
              galleryId: lutTelemetryGalleryId,
              surface: lutTelemetrySurface,
              message: "video_not_webgl_renderable",
            });
          }
        });
      });
    };

    const onVideoSignal = () => runProbe();

    let prevW = video.videoWidth;
    let prevH = video.videoHeight;
    const onMaybeDimensionBump = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if ((prevW <= 0 || prevH <= 0) && w > 0 && h > 0) {
        runProbe();
      }
      prevW = w;
      prevH = h;
    };

    video.addEventListener("loadeddata", onVideoSignal);
    video.addEventListener("canplay", onVideoSignal);
    video.addEventListener("loadedmetadata", onVideoSignal);
    video.addEventListener("playing", onVideoSignal);
    video.addEventListener("loadedmetadata", onMaybeDimensionBump);
    video.addEventListener("loadeddata", onMaybeDimensionBump);

    webglProbeTriggerRef.current = runProbe;

    if (
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.videoHeight > 0
    ) {
      queueMicrotask(runProbe);
    }

    return () => {
      cancelled = true;
      clearRaf();
      webglProbeTriggerRef.current = null;
      video.removeEventListener("loadeddata", onVideoSignal);
      video.removeEventListener("canplay", onVideoSignal);
      video.removeEventListener("loadedmetadata", onVideoSignal);
      video.removeEventListener("playing", onVideoSignal);
      video.removeEventListener("loadedmetadata", onMaybeDimensionBump);
      video.removeEventListener("loadeddata", onMaybeDimensionBump);
    };
  }, [
    galleryControlledLut,
    previewOn,
    currentLutSource,
    videoSrc,
    lutTelemetryGalleryId,
    lutTelemetrySurface,
    lutTelemetryPasswordProtected,
  ]);

  /** Single consolidated log for gallery-controlled render gating (dev / ?galleryVideoDebug). */
  useEffect(() => {
    if (!galleryControlledLut || !galleryLutDevHudEnabled()) return;
    const v = videoRef.current;
    console.debug("[VideoWithLUT gallery LUT render inputs]", {
      galleryControlledLut,
      shouldApplyLut,
      lutSource: lutSource
        ? lutSource.length > 120
          ? `${lutSource.slice(0, 120)}…`
          : lutSource
        : null,
      currentLutSource: currentLutSource
        ? currentLutSource.length > 120
          ? `${currentLutSource.slice(0, 120)}…`
          : currentLutSource
        : null,
      previewOn,
      lutReady,
      videoWebglEligibility,
      bypassVideoWebglSamplingGate: bypassVideoWebglSamplingGate(),
      lutEnabledInShader,
      videoReadyState: v?.readyState,
      videoWidth: v?.videoWidth,
      videoHeight: v?.videoHeight,
    });
  }, [
    galleryControlledLut,
    shouldApplyLut,
    lutSource,
    currentLutSource,
    previewOn,
    lutReady,
    videoWebglEligibility,
    lutEnabledInShader,
  ]);

  /**
   * Dashboard / FilePreviewModal path (`galleryControlledLut` false): same debug gate as
   * `[FilePreviewModal LUT]` — proves currentLutSource, previewOn, lutReady, and canvas gating.
   */
  useEffect(() => {
    if (galleryControlledLut || !filePreviewLutDebugEnabled()) return;
    const canvasInDom = previewOn && !!currentLutSource;
    const canvasDomBlockReason = !previewOn
      ? "previewOff"
      : !currentLutSource
        ? "noLutSource"
        : null;
    const v = videoRef.current;
    console.info("[VideoWithLUT modal LUT]", {
      galleryControlledLut,
      src: src.length > 120 ? `${src.slice(0, 120)}…` : src,
      streamUrl: streamUrl
        ? streamUrl.length > 120
          ? `${streamUrl.slice(0, 120)}…`
          : streamUrl
        : null,
      videoSrc: videoSrc.length > 120 ? `${videoSrc.slice(0, 120)}…` : videoSrc,
      lutSource,
      currentLutSource,
      previewOn,
      lutReady,
      lutEnabledInShader,
      videoWebglEligibility,
      canvasInDom,
      canvasDomBlockReason,
      lutPipelineReady: lutReady,
      lutError,
      showLUTOption,
      creativePreviewOn: creativePreviewOn ?? null,
      lutOptionsCount: lutOptions.length,
      videoReadyState: v?.readyState,
      videoWidth: v?.videoWidth,
      videoHeight: v?.videoHeight,
    });
  }, [
    galleryControlledLut,
    src,
    streamUrl,
    videoSrc,
    lutSource,
    currentLutSource,
    previewOn,
    lutReady,
    lutEnabledInShader,
    videoWebglEligibility,
    lutError,
    showLUTOption,
    creativePreviewOn,
    lutOptions.length,
  ]);

  const [galleryHudTick, setGalleryHudTick] = useState(0);
  useEffect(() => {
    if (!galleryControlledLut || !galleryLutDevHudEnabled()) return;
    const id = window.setInterval(() => setGalleryHudTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [galleryControlledLut]);

  const galleryPassThroughSummary = useMemo((): string | null => {
    if (!galleryControlledLut || !galleryLutDevHudEnabled()) return null;
    if (!shouldApplyLut) return "pass-through: shouldApplyLut false";
    if (!currentLutSource) return "pass-through: missing currentLutSource";
    if (!lutReady) return "pass-through: lutReady false";
    if (!bypassVideoWebglSamplingGate() && videoWebglEligibility === "failed") {
      return "pass-through: video WebGL sampling failed";
    }
    if (videoWebglEligibility === "unknown") {
      return "probing: WebGL eligibility unknown (LUT shader path on)";
    }
    const stale = lutReady && previewOn && currentLutSource;
    const ageMs = performance.now() - lastLutRenderFrameAtRef.current;
    if (stale && lastLutRenderFrameAtRef.current > 0 && ageMs > 2000) {
      return "pass-through?: render loop may be inactive (>2s since last graded frame)";
    }
    if (previewOn && currentLutSource && lutReady) {
      return "grading: LUT draw path active";
    }
    return null;
  }, [
    galleryControlledLut,
    shouldApplyLut,
    currentLutSource,
    lutReady,
    videoWebglEligibility,
    previewOn,
    galleryHudTick,
  ]);

  useEffect(() => {
    if (!galleryControlledLut || !galleryLutDevHudEnabled()) return;
    if (!galleryPassThroughSummary || galleryPassThroughSummary.startsWith("grading:")) {
      return;
    }
    console.debug("[VideoWithLUT gallery LUT pass-through]", galleryPassThroughSummary);
  }, [galleryControlledLut, galleryPassThroughSummary]);

  /** Preview off: fade graded layer out, then tear down WebGL (avoids instant unmount pop). */
  useEffect(() => {
    if (previewOn) {
      setGradeLayerOpacity(1);
      return;
    }
    setGradeLayerOpacity(0);
    const tid = window.setTimeout(() => {
      if (lutTransitionRafRef.current != null) {
        cancelAnimationFrame(lutTransitionRafRef.current);
        lutTransitionRafRef.current = null;
      }
      const ctx = glRef.current;
      if (ctx) {
        disposeVideoLUTContext(ctx);
        glRef.current = null;
      }
      displayedLutUrlRef.current = null;
      lutCrossfadeRef.current = 0;
      setLutReady(false);
      setGradeLayerOpacity(1);
    }, GRADE_LAYER_FADE_MS);
    return () => window.clearTimeout(tid);
  }, [previewOn]);

  useLayoutEffect(() => {
    if (!previewOn) return;

    if (!currentLutSource) {
      if (lutTransitionRafRef.current != null) {
        cancelAnimationFrame(lutTransitionRafRef.current);
        lutTransitionRafRef.current = null;
      }
      /** No graded pass: ensure canvas is visible if we still mount it (shader uses lutEnabled false). */
      setGradeLayerOpacity(1);
      if (glRef.current) {
        setLutReady(true);
        setLutError(null);
      } else {
        setLutReady(false);
      }
      return;
    }

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext("webgl2", { alpha: true });
    if (!gl) {
      setError("WebGL2 not supported");
      if (galleryControlledLut) {
        logGalleryLutEvent("gallery_video_webgl2_unavailable", {
          galleryId: lutTelemetryGalleryId,
          surface: lutTelemetrySurface,
        });
      }
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, size } = await getOrLoadLUT(currentLutSource);
        if (cancelled) return;

        if (!glRef.current) {
          setGradeLayerOpacity(0);
          glRef.current = createVideoLUTContext(gl, data, size);
          displayedLutUrlRef.current = currentLutSource;
          lutCrossfadeRef.current = 0;
          setLutReady(true);
          setLutError(null);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => setGradeLayerOpacity(1));
          });
          return;
        }

        if (displayedLutUrlRef.current === currentLutSource) {
          setLutError(null);
          setLutReady(true);
          return;
        }

        if (lutTransitionRafRef.current != null) {
          cancelAnimationFrame(lutTransitionRafRef.current);
          lutTransitionRafRef.current = null;
        }

        setSecondaryVideoLut(glRef.current, data, size);
        lutCrossfadeRef.current = 0;
        const ctx = glRef.current;
        const start = performance.now();

        const tick = () => {
          if (cancelled || !glRef.current) return;
          const t = Math.min(1, (performance.now() - start) / VIDEO_LUT_CROSSFADE_MS);
          lutCrossfadeRef.current = easeInOutCubic(t);
          if (t < 1) {
            lutTransitionRafRef.current = requestAnimationFrame(tick);
          } else {
            lutTransitionRafRef.current = null;
            swapPrimarySecondaryVideoLut(ctx);
            lutCrossfadeRef.current = 0;
            displayedLutUrlRef.current = currentLutSource;
          }
        };
        lutTransitionRafRef.current = requestAnimationFrame(tick);
        setLutReady(true);
        setLutError(null);
      } catch (e) {
        if (!cancelled) {
          setLutError(e instanceof Error ? e.message : "LUT load failed");
          setLutReady(false);
          if (galleryControlledLut) {
            logGalleryLutEvent("gallery_lut_fetch_failed", {
              galleryId: lutTelemetryGalleryId,
              surface: lutTelemetrySurface,
              message: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }
    })();

    return () => {
      cancelled = true;
      if (lutTransitionRafRef.current != null) {
        cancelAnimationFrame(lutTransitionRafRef.current);
        lutTransitionRafRef.current = null;
      }
      /**
       * If init set opacity 0 then this effect re-ran or the async was abandoned before rAF
       * restored 1, the graded layer stayed invisible (video looked like Original).
       */
      setGradeLayerOpacity(1);
    };
  }, [
    previewOn,
    currentLutSource,
    galleryControlledLut,
    lutTelemetryGalleryId,
    lutTelemetrySurface,
  ]);

  useEffect(() => {
    return () => {
      if (lutTransitionRafRef.current != null) {
        cancelAnimationFrame(lutTransitionRafRef.current);
        lutTransitionRafRef.current = null;
      }
      const ctx = glRef.current;
      if (ctx) {
        disposeVideoLUTContext(ctx);
        glRef.current = null;
      }
    };
  }, []);

  /** HLS.js lifecycle + native video readiness (file preview debug or ?galleryVideoDebug). */
  useEffect(() => {
    if (!videoHlsDiagEnabled()) return;
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const label = playbackDebugLabel ?? "VideoWithLUT";
    const snap = (event: string) => {
      console.info(`[VideoWithLUT video] ${event}`, {
        label,
        videoSrc: videoSrc.length > 120 ? `${videoSrc.slice(0, 120)}…` : videoSrc,
        readyState: video.readyState,
        networkState: video.networkState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        currentSrc:
          video.currentSrc && video.currentSrc.length > 120
            ? `${video.currentSrc.slice(0, 120)}…`
            : video.currentSrc,
      });
    };
    const onLoadedMeta = () => snap("loadedmetadata");
    const onLoadedData = () => snap("loadeddata");
    const onCanPlay = () => snap("canplay");
    const onPlaying = () => snap("playing");
    const onError = () =>
      snap(`error code=${video.error?.code ?? "?"} msg=${video.error?.message ?? ""}`);
    video.addEventListener("loadedmetadata", onLoadedMeta);
    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMeta);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("error", onError);
    };
  }, [videoSrc, playbackDebugLabel]);

  useEffect(() => {
    if (!onIntrinsicVideoSize) return;
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const onMeta = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) onIntrinsicVideoSize(w, h);
    };
    video.addEventListener("loadedmetadata", onMeta);
    if (video.readyState >= 1) onMeta();
    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [videoSrc, onIntrinsicVideoSize]);

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

      if (videoObjectFit === "cover") {
        const contentW = videoRect.width;
        const contentH = videoRect.height;
        const contentLeft = videoRect.left - containerRect.left;
        const contentTop = videoRect.top - containerRect.top;
        const w = Math.max(1, Math.floor(contentW * dpr));
        const h = Math.max(1, Math.floor(contentH * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        Object.assign(canvas.style, {
          position: "absolute",
          left: `${contentLeft}px`,
          top: `${contentTop}px`,
          width: `${contentW}px`,
          height: `${contentH}px`,
        });
        return;
      }

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

      const videoRect = video.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const coverCrop =
        videoObjectFit === "cover" && vw > 0 && vh > 0
          ? videoCoverTextureCrop(videoRect.width, videoRect.height, vw, vh)
          : undefined;

      renderVideoFrameWithLUT(ctx, video, w, h, {
        lutEnabled: lutEnabledInShader,
        lutCrossfade: lutCrossfadeRef.current,
        videoTextureCrop: coverCrop,
      });
      lastLutRenderFrameAtRef.current = performance.now();

      if (!cancelled) rafId = requestAnimationFrame(render);
    };

    const onResize = () => resize();
    const onFullscreenChange = () => requestAnimationFrame(resize);
    window.addEventListener("resize", onResize);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    video.addEventListener("loadeddata", render);
    video.addEventListener("canplay", render);
    if (video.readyState >= 2) render();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      video.removeEventListener("loadeddata", render);
      video.removeEventListener("canplay", render);
    };
  }, [previewOn, lutReady, currentLutSource, videoObjectFit, lutEnabledInShader]);

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
    if (error && onDisplayReady) onDisplayReady();
  }, [error, onDisplayReady]);

  const fireDisplayReady = useCallback(() => {
    if (!onDisplayReady || displayReadyFiredRef.current) return;
    const v = videoRef.current;
    if (!v || v.readyState < 2) return;
    if (v.videoWidth <= 0 || v.videoHeight <= 0) return;
    displayReadyFiredRef.current = true;
    onDisplayReady();
  }, [onDisplayReady]);

  useEffect(() => {
    displayReadyFiredRef.current = false;
  }, [videoSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const onReady = () => fireDisplayReady();
    video.addEventListener("loadeddata", onReady);
    video.addEventListener("canplay", onReady);
    if (video.readyState >= 2) queueMicrotask(onReady);
    return () => {
      video.removeEventListener("loadeddata", onReady);
      video.removeEventListener("canplay", onReady);
    };
  }, [videoSrc, fireDisplayReady]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    const isHls = videoSrc.includes(".m3u8");
    if (isHls && Hls.isSupported()) {
      hlsRef.current?.destroy();
      const hls = createGalleryHlsInstance({
        preferMaxQuality: preferMaxHlsQuality,
        maxBufferDefault: 30,
        maxBufferTopRung: 60,
      });
      hlsRef.current = hls;
      const logHls = (msg: string, extra?: Record<string, unknown>) => {
        if (!videoHlsDiagEnabled()) return;
        console.info("[VideoWithLUT HLS]", msg, {
          videoSrc: videoSrc.length > 120 ? `${videoSrc.slice(0, 120)}…` : videoSrc,
          ...extra,
        });
      };
      logHls("hls.js: instance created");
      const probe = () => webglProbeTriggerRef.current?.();
      hls.on(Hls.Events.MEDIA_ATTACHING, () => logHls("MEDIA_ATTACHING"));
      hls.on(Hls.Events.MEDIA_ATTACHED, (_, data) => {
        logHls("MEDIA_ATTACHED", { hasMedia: data != null });
        probe();
      });
      hls.on(Hls.Events.MANIFEST_LOADING, () => logHls("MANIFEST_LOADING"));
      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        logHls("MANIFEST_PARSED", { levelCount: data?.levels?.length });
        probe();
      });
      hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
        logHls("LEVEL_LOADED", { level: data?.level });
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        logHls("ERROR", {
          type: data?.type,
          details: data?.details,
          fatal: data?.fatal,
          errMessage:
            data?.error != null && typeof data.error === "object" && "message" in data.error
              ? String((data.error as { message?: string }).message)
              : undefined,
        });
      });
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
  }, [videoSrc, preferMaxHlsQuality]);

  useEffect(() => {
    if (!playbackDebugLabel || !isGalleryVideoDebugEnabled()) return;
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const onMeta = () => {
      const isHls = videoSrc.includes(".m3u8");
      const usesHlsJs = isHls && Hls.isSupported() && hlsRef.current != null;
      const player: "hls.js" | "native_hls" | "progressive" = isHls
        ? usesHlsJs
          ? "hls.js"
          : "native_hls"
        : "progressive";
      console.info(`[gallery-video:${playbackDebugLabel}]`, {
        videoSrc: videoSrc.length > 100 ? `${videoSrc.slice(0, 100)}…` : videoSrc,
        preferMaxHlsQuality,
        lutPreviewOn: previewOn && !!currentLutSource,
        videoObjectFit,
        player,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
      });
    };
    video.addEventListener("loadedmetadata", onMeta);
    const t = window.setTimeout(onMeta, 250);
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      window.clearTimeout(t);
    };
  }, [
    playbackDebugLabel,
    videoSrc,
    preferMaxHlsQuality,
    previewOn,
    currentLutSource,
    videoObjectFit,
  ]);

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !segmentLoopSeconds || segmentLoopSeconds <= 0 || !compactPreview) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onPause = () => {
      if (video.ended) return;
      if (t != null) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
        if (!video.paused || video.ended) return;
        void video.play().catch(() => {});
      }, 60);
    };
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("pause", onPause);
      if (t != null) clearTimeout(t);
    };
  }, [segmentLoopSeconds, compactPreview, videoSrc]);

  const onSegmentLoopEnded = useCallback(
    (e: SyntheticEvent<HTMLVideoElement>) => {
      if (!segmentLoopSeconds || segmentLoopSeconds <= 0) return;
      const v = e.currentTarget;
      v.currentTime = 0;
      void v.play().catch(() => {});
    },
    [segmentLoopSeconds],
  );

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

  /** Full media stage (immersive modal / gallery). Excludes side-by-side LUT toolbar layout. */
  const framelessFillStage =
    frameless &&
    !compactPreview &&
    !isFullscreen &&
    !(sideBySideLut && showLUTOption);

  const containerStyle: React.CSSProperties = compactPreview
    ? { width: "100%", height: "100%", minHeight: 0 }
    : isFullscreen
      ? { width: "100vw", height: "100vh", maxHeight: "100vh" }
      : framelessFillStage
        ? { minHeight: 0, height: "100%", width: "100%", maxHeight: "100%" }
        : frameless
          ? { minHeight: 0, maxHeight: "100%" }
          : {
              maxHeight: "70vh",
              aspectRatio: "16 / 9",
            };

  const outerClass = compactPreview
    ? "h-full w-full min-h-0"
    : sideBySideLut && showLUTOption
      ? "flex h-full max-h-full min-h-0 w-full max-w-full flex-col items-center justify-center gap-4 lg:flex-row lg:items-center lg:justify-center lg:gap-5"
      : "flex h-full max-h-full min-h-0 w-full max-w-full flex-col items-center justify-center gap-4";

  const videoShellClass = frameless
    ? compactPreview
      ? "rounded-lg bg-black"
      : framelessFillStage
        ? "video-immersive-stage relative flex h-full min-h-0 w-full max-h-full max-w-full min-w-0 items-center justify-center overflow-hidden rounded-lg bg-black"
        : "rounded-lg bg-black mx-auto max-h-full max-w-full w-fit min-h-0 min-w-0"
    : compactPreview
      ? "rounded-lg bg-neutral-200 dark:bg-black"
      : "rounded-xl bg-neutral-200 shadow-xl ring-1 ring-neutral-200 dark:bg-black dark:ring-neutral-700/50";

  return (
    <div className={outerClass}>
      <div
        ref={containerRef}
        className={`video-fullscreen-container relative isolate overflow-hidden ${videoShellClass}`}
        style={containerStyle}
      >
        {/*
          Stack: video z-0, graded canvas z-[15], custom chrome z-30+.
          Modal/dashboard used to omit z-0 on the video; some browsers then composite the video
          layer above the WebGL canvas so the grade looks missing while controls still show.
        */}
        <video
          ref={videoRef}
          poster={poster ?? undefined}
          src={!videoSrc.includes(".m3u8") ? videoSrc : undefined}
          crossOrigin="anonymous"
          controls={false}
          preload={proxyOnlyPlayback ? "none" : "metadata"}
          playsInline
          muted={compactPreview ? true : undefined}
          autoPlay={compactPreview ? true : undefined}
          onEnded={segmentLoopSeconds && segmentLoopSeconds > 0 ? onSegmentLoopEnded : undefined}
          style={videoStyle}
          className={
            "relative z-0 " +
            (compactPreview
              ? `h-full w-full object-cover ${className ?? ""}`
              : frameless && !isFullscreen
                ? framelessFillStage
                  ? `max-h-full max-w-[min(100%,100vw)] object-contain ${className ?? ""}`
                  : `max-h-full max-w-full h-auto w-auto max-w-[100vw] object-contain ${className ?? ""}`
                : `max-h-full max-w-full h-auto w-auto max-w-[100vw] object-contain ${className ?? ""} ${isFullscreen ? "!max-h-none min-h-full !w-full" : !frameless ? "max-h-[70vh] w-full" : ""}`
            )
          }
        />
        {/*
          Mount the WebGL canvas whenever we intend to grade (lut pipeline init needs the canvas ref).
          Do not gate on lutReady — that deadlocks: LUT init requires canvas, but lutReady was only set after init.
        */}
        {previewOn && currentLutSource && (
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute left-0 top-0 z-[15] will-change-[opacity,transform] [transform:translateZ(0)]"
            style={{
              opacity: lutError ? 0 : lutReady ? gradeLayerOpacity : 0,
              transition: `opacity ${GRADE_LAYER_FADE_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
            }}
          />
        )}
        {galleryPassThroughSummary && (
          <div
            className="pointer-events-none absolute left-2 top-2 z-[40] max-w-[min(100%,22rem)] rounded-md bg-black/75 px-2 py-1 font-mono text-[10px] leading-snug text-amber-100 shadow-md ring-1 ring-white/15"
            aria-hidden
          >
            {galleryPassThroughSummary}
          </div>
        )}
        {!compactPreview && (
        <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col gap-2 bg-gradient-to-t from-black/95 via-black/80 to-transparent px-4 pb-3 pt-8 transition-opacity duration-200">
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
        <div
          className={`flex w-full flex-col gap-3 rounded-xl px-4 py-3 ${
            sideBySideLut
              ? "border border-white/15 bg-black/40 backdrop-blur-xl dark:border-white/15 dark:bg-black/45 lg:max-w-sm lg:shrink-0"
              : "border border-neutral-200 bg-neutral-100 backdrop-blur-sm dark:border-neutral-700/60 dark:bg-neutral-800/60"
          }`}
        >
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
