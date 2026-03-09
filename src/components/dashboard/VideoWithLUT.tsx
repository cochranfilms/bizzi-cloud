"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Pause, Play, Volume2, VolumeX, Maximize } from "lucide-react";

const LUT_SIZE = 33;
const LUT_URL = "/CINECOLOR_S-LOG3.cube";

/**
 * Parse a .cube file and return raw RGBA data for a 2D texture (size*size x size).
 * CUBE format: LUT_3D_SIZE N, then N³ lines of "R G B" (R varies fastest).
 */
async function parseCubeFile(text: string): Promise<Float32Array> {
  const lines = text.trim().split(/\r?\n/);
  let size = 0;
  const values: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("TITLE") || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0] === "LUT_3D_SIZE" && parts[1]) {
      size = parseInt(parts[1], 10);
      continue;
    }
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        values.push(r, g, b, 1);
      }
    }
  }

  if (size === 0) size = Math.round(Math.cbrt(values.length / 4)) || 33;
  return new Float32Array(values);
}

/**
 * Create a 2D texture from 3D LUT data. Layout: (size*size) x size, RGB per texel.
 */
function createLUTTexture(
  gl: WebGL2RenderingContext,
  data: Float32Array,
  size: number
): WebGLTexture {
  const texture = gl.createTexture();
  if (!texture) throw new Error("Failed to create LUT texture");

  const total = size * size * size;
  const pixels = new Uint8Array(total * 4);
  for (let i = 0; i < total; i++) {
    pixels[i * 4] = Math.round((data[i * 4] ?? 0) * 255);
    pixels[i * 4 + 1] = Math.round((data[i * 4 + 1] ?? 0) * 255);
    pixels[i * 4 + 2] = Math.round((data[i * 4 + 2] ?? 0) * 255);
    pixels[i * 4 + 3] = 255;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    size * size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_video;
uniform sampler2D u_lut;
uniform float u_lutSize;
uniform float u_lutEnabled;
in vec2 v_texCoord;
out vec4 fragColor;

vec4 sampleLUT(vec3 rgb) {
  float size = u_lutSize;
  float size2 = size * size;
  float margin = 0.5 / size;
  vec3 scaled = margin + rgb * (1.0 - 1.0 / size);
  vec3 f = scaled * (size - 1.0);
  vec3 i0 = floor(f);
  vec3 i1 = min(i0 + 1.0, size - 1.0);
  vec3 t = fract(f);

  vec4 c000 = texelFetch(u_lut, ivec2(i0.r + i0.g * size, i0.b), 0);
  vec4 c100 = texelFetch(u_lut, ivec2(i1.r + i0.g * size, i0.b), 0);
  vec4 c010 = texelFetch(u_lut, ivec2(i0.r + i1.g * size, i0.b), 0);
  vec4 c110 = texelFetch(u_lut, ivec2(i1.r + i1.g * size, i0.b), 0);
  vec4 c001 = texelFetch(u_lut, ivec2(i0.r + i0.g * size, i1.b), 0);
  vec4 c101 = texelFetch(u_lut, ivec2(i1.r + i0.g * size, i1.b), 0);
  vec4 c011 = texelFetch(u_lut, ivec2(i0.r + i1.g * size, i1.b), 0);
  vec4 c111 = texelFetch(u_lut, ivec2(i1.r + i1.g * size, i1.b), 0);

  vec4 c00 = mix(c000, c100, t.r);
  vec4 c01 = mix(c010, c110, t.r);
  vec4 c10 = mix(c001, c101, t.r);
  vec4 c11 = mix(c011, c111, t.r);
  vec4 c0 = mix(c00, c01, t.g);
  vec4 c1 = mix(c10, c11, t.g);
  return mix(c0, c1, t.b);
}

void main() {
  vec4 v = texture(u_video, v_texCoord);
  if (u_lutEnabled > 0.5) {
    fragColor = vec4(sampleLUT(v.rgb).rgb, v.a);
  } else {
    fragColor = v;
  }
}
`;

interface VideoWithLUTProps {
  src: string;
  streamUrl?: string | null;
  className?: string;
  /** When false, LUT toggle is hidden and video plays without Rec 709. Default: false. */
  showLUTOption?: boolean;
  /** Called when LUT is toggled on/off. Use to bake LUT into download when enabled. */
  onLutChange?: (enabled: boolean) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function VideoWithLUT({ src, streamUrl, className, showLUTOption = false, onLutChange }: VideoWithLUTProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [lutEnabled, setLutEnabled] = useState(false);
  const [videoDimensions, setVideoDimensions] = useState<{ width: number; height: number } | null>(null);
  const [lutReady, setLutReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const glRef = useRef<{
    gl: WebGL2RenderingContext;
    program: WebGLProgram;
    lutTexture: WebGLTexture;
    videoTexture: WebGLTexture;
  } | null>(null);

  const loadLUT = useCallback(async () => {
    const res = await fetch(LUT_URL);
    if (!res.ok) throw new Error("Failed to load LUT");
    const text = await res.text();
    return parseCubeFile(text);
  }, []);

  useEffect(() => {
    if (!lutEnabled) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const gl = canvas.getContext("webgl2", { alpha: true });
    if (!gl) {
      setError("WebGL2 not supported");
      return;
    }

    const compileShader = (source: string, type: number): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(shader) ?? "Shader compile failed");
      }
      return shader;
    };

    const vs = compileShader(VERTEX_SHADER, gl.VERTEX_SHADER);
    const fs = compileShader(FRAGMENT_SHADER, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) ?? "Program link failed");
    }

    const videoTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    loadLUT()
      .then((data) => {
        const lutTexture = createLUTTexture(gl, data, LUT_SIZE);
        glRef.current = { gl, program, lutTexture, videoTexture };
        setLutReady(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "LUT load failed"));

    return () => {
      gl.deleteTexture(videoTexture);
      glRef.current = null;
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      setLutReady(false);
    };
  }, [loadLUT, lutEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const container = containerRef.current;
    const ctx = glRef.current;
    if (!canvas || !video || !container || !ctx || !lutReady) return;

    const { gl, program, lutTexture, videoTexture } = ctx;

    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      const videoRect = video.getBoundingClientRect();
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!containerRect || vw <= 0 || vh <= 0) return;

      // object-fit: contain - compute actual displayed content rect (handles 9:16 vs 16:9)
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

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);

      const posLoc = gl.getAttribLocation(program, "a_position");
      const texLoc = gl.getAttribLocation(program, "a_texCoord");
      const posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      const texBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]),
        gl.STATIC_DRAW
      );
      gl.enableVertexAttribArray(texLoc);
      gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, videoTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, lutTexture);

      gl.uniform1i(gl.getUniformLocation(program, "u_video"), 0);
      gl.uniform1i(gl.getUniformLocation(program, "u_lut"), 1);
      gl.uniform1f(gl.getUniformLocation(program, "u_lutSize"), LUT_SIZE);
      gl.uniform1f(gl.getUniformLocation(program, "u_lutEnabled"), lutEnabled ? 1 : 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

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
  }, [lutEnabled, lutReady]);

  const handleLUTToggle = useCallback(() => {
    setLutEnabled((v) => {
      const next = !v;
      onLutChange?.(next);
      return next;
    });
  }, [onLutChange]);

  // Sync video state and capture intrinsic dimensions for aspect-ratio (9:16 vs 16:9)
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onLoadedMetadata = () => {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (w > 0 && h > 0) setVideoDimensions({ width: w, height: h });
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };
    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("volumechange", onVolumeChange);
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
    }
    setCurrentTime(video.currentTime);
    setDuration(video.duration);
    setVolume(video.volume);
    setIsMuted(video.muted);
    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
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

  if (error) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg bg-red-900/20 p-4 text-red-400">
        <p className="text-sm">{error}</p>
        <video
          ref={videoRef}
          src={src}
          crossOrigin="anonymous"
          controls
          preload="metadata"
          className={className}
        />
      </div>
    );
  }

  const containerStyle: React.CSSProperties = isFullscreen
    ? { width: "100vw", height: "100vh", maxHeight: "100vh" }
    : {
        maxHeight: "70vh",
        ...(videoDimensions && {
          aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}`,
        }),
      };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div
        ref={containerRef}
        className="video-fullscreen-container relative w-full max-w-full overflow-hidden rounded-xl bg-black shadow-xl ring-1 ring-neutral-700/50"
        style={containerStyle}
      >
        <video
          ref={videoRef}
          src={src}
          crossOrigin="anonymous"
          controls={false}
          preload="auto"
          playsInline
          className={`max-w-full w-full h-full object-contain ${className ?? ""} ${isFullscreen ? "!max-h-none min-h-full" : "max-h-[70vh]"}`}
        />
        {lutEnabled && (
          <canvas
            ref={canvasRef}
            className="absolute left-0 top-0 transition-opacity duration-200"
            style={{
              pointerEvents: "none",
              opacity: lutReady ? 1 : 0,
            }}
          />
        )}
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
      </div>
      {showLUTOption && (
        <div className="flex w-full items-center justify-between gap-4 rounded-xl border border-neutral-700/60 bg-neutral-800/60 px-4 py-3 backdrop-blur-sm">
          <button
            type="button"
            onClick={handleLUTToggle}
            className={`flex items-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              lutEnabled
                ? "bg-gradient-to-r from-bizzi-blue to-bizzi-cyan text-white shadow-lg shadow-bizzi-blue/20"
                : "bg-neutral-700/50 text-neutral-300 ring-1 ring-neutral-600/50 transition-colors hover:bg-neutral-600/60 hover:ring-neutral-500"
            }`}
            title="S-Log3 → Rec 709. If preview is black, add CORS to your B2 bucket."
          >
            <span
              className={`inline-block h-3 w-3 rounded-full border-2 transition-colors ${
                lutEnabled
                  ? "border-white bg-white"
                  : "border-neutral-500 bg-transparent"
              }`}
            />
            Rec 709 LUT
          </button>
          <span className="text-xs text-neutral-400">
            <span className={lutEnabled ? "font-medium text-bizzi-cyan" : ""}>
              {lutEnabled ? "On" : "Off"}
            </span>
            {" · "}For S-Log3 / Sony RAW
          </span>
        </div>
      )}
    </div>
  );
}
