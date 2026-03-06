"use client";

import { useRef, useEffect, useState, useCallback } from "react";

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

  float sx = size2;
  float sy = size;
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
  getStreamUrl?: () => Promise<string>;
  className?: string;
}

export default function VideoWithLUT({ src, getStreamUrl, className }: VideoWithLUTProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [lutEnabled, setLutEnabled] = useState(false);
  const [lutReady, setLutReady] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [lutLoading, setLutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    const gl = canvas.getContext("webgl2");
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
    const ctx = glRef.current;
    if (!canvas || !video || !ctx || !lutReady) return;

    const { gl, program, lutTexture, videoTexture } = ctx;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const render = () => {
      if (video.readyState < 2) {
        requestAnimationFrame(render);
        return;
      }
      resize();
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        requestAnimationFrame(render);
        return;
      }
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
      requestAnimationFrame(render);
    };

    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    video.addEventListener("loadeddata", render);
    if (video.readyState >= 2) render();

    return () => {
      window.removeEventListener("resize", onResize);
      video.removeEventListener("loadeddata", render);
    };
  }, [lutEnabled, lutReady]);

  const effectiveSrc = lutEnabled && streamUrl ? streamUrl : src;

  const handleLUTToggle = async () => {
    if (lutEnabled) {
      setLutEnabled(false);
      return;
    }
    if (getStreamUrl && !streamUrl) {
      setLutLoading(true);
      try {
        const url = await getStreamUrl();
        setStreamUrl(url);
        setLutEnabled(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load stream for LUT");
      } finally {
        setLutLoading(false);
      }
    } else {
      setLutEnabled(true);
    }
  };

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

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-full" style={{ maxHeight: "70vh" }}>
        {lutLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-900/90 rounded-lg">
            <div className="flex flex-col items-center gap-2 text-neutral-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span className="text-sm">Loading LUT preview…</span>
            </div>
          </div>
        )}
        <video
          ref={videoRef}
          src={effectiveSrc}
          crossOrigin="anonymous"
          controls
          preload="auto"
          playsInline
          key={effectiveSrc}
          className={`max-h-[70vh] w-full rounded-lg ${className ?? ""}`}
        />
        {lutEnabled && (
          <canvas
            ref={canvasRef}
            className="absolute left-0 right-0 top-0 rounded-t-lg"
            style={{
              width: "100%",
              height: "calc(100% - 50px)",
              maxHeight: "calc(70vh - 50px)",
              pointerEvents: "none",
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-neutral-800/80 px-3 py-1.5">
        <button
          type="button"
          onClick={handleLUTToggle}
          disabled={lutLoading}
          className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium transition-colors ${
            lutEnabled
              ? "bg-bizzi-blue text-white"
              : "bg-neutral-700/50 text-neutral-300 hover:bg-neutral-600"
          }`}
          title="S-Log3 → Rec 709"
        >
          <span className="inline-block h-3 w-3 rounded-full border border-current bg-current opacity-80" />
          Rec 709 LUT
        </button>
        <span className="text-xs text-neutral-500">
          {lutEnabled ? "On" : "Off"} · For S-Log3 / Sony RAW
        </span>
      </div>
    </div>
  );
}
