"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import {
  createLUTTexture,
  createImageLUTContext,
  renderImageWithLUT,
  type ImageLUTContext,
} from "@/lib/creative-lut/image-lut-engine";
import { lutDebug } from "@/lib/creative-lut/lut-debug";
import { getOrLoadLUT } from "@/lib/creative-lut/lut-cache";

interface ImageWithLUTProps {
  imageUrl: string;
  /** URL (signed) or builtin LUT id (e.g. sony_rec709) */
  lutUrl: string | null;
  lutEnabled: boolean;
  className?: string;
  alt?: string;
  /** "contain" (default) or "cover" for object-fit */
  objectFit?: "contain" | "cover";
  /** default: grid tiles / lightbox; fill: hero banner full-bleed */
  variant?: "default" | "fill";
  /**
   * Gallery tiles: match plain <img> sizing (block + w-full + h-auto vs h-full).
   * Omit for lightbox / max-h constrained layouts (uses shrink-wrapped inline-block).
   */
  tileLayout?: "masonry" | "grid";
  imageStyle?: CSSProperties;
}

export default function ImageWithLUT({
  imageUrl,
  lutUrl,
  lutEnabled,
  className = "",
  alt = "",
  objectFit = "contain",
  variant = "default",
  tileLayout,
  imageStyle,
}: ImageWithLUTProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glContextRef = useRef<ImageLUTContext | null>(null);
  const loggedFirstDrawRef = useRef<string | null>(null);
  const [lutReady, setLutReady] = useState(false);
  const [lutError, setLutError] = useState<string | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
    loggedFirstDrawRef.current = null;
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !lutEnabled || !lutUrl) return;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      lutDebug("WebGL2 unsupported");
      setWebglAvailable(false);
      return;
    }
    setWebglAvailable(true);
    lutDebug("WebGL2 context OK, loading LUT", { lutUrl: lutUrl.slice(0, 120) });

    let cancelled = false;
    getOrLoadLUT(lutUrl)
      .then(({ data, size }) => {
        if (cancelled) return;
        const lutTexture = createLUTTexture(gl, data, size);
        glContextRef.current = createImageLUTContext(gl, lutTexture, size);
        setLutReady(true);
        setLutError(null);
        lutDebug("LUT GPU upload complete", { size });
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "LUT load failed";
          lutDebug("LUT load failed", msg);
          setLutError(msg);
          setLutReady(false);
        }
      });

    return () => {
      cancelled = true;
      const ctx = glContextRef.current;
      if (ctx) {
        ctx.gl.deleteTexture(ctx.imageTexture);
        ctx.gl.deleteTexture(ctx.lutTexture);
        ctx.gl.deleteProgram(ctx.program);
        glContextRef.current = null;
      }
      setLutReady(false);
    };
  }, [lutEnabled, lutUrl]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const container = containerRef.current;
    const ctx = glContextRef.current;
    if (!canvas || !img || !container || !ctx || !lutReady || !lutEnabled || !imageLoaded) return;

    const rect = img.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const displayedW = rect.width;
    const displayedH = rect.height;

    if (displayedW <= 0 || displayedH <= 0) return;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;

    const w = Math.max(1, Math.floor(displayedW * dpr));
    const h = Math.max(1, Math.floor(displayedH * dpr));

    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    renderImageWithLUT(ctx, img, w, h);
    const drawKey = `${lutUrl}:${imageUrl}:${w}x${h}`;
    if (loggedFirstDrawRef.current !== drawKey) {
      loggedFirstDrawRef.current = drawKey;
      lutDebug("first canvas draw after LUT / layout", {
        w,
        h,
        naturalW: img.naturalWidth,
        naturalH: img.naturalHeight,
      });
    }
  }, [lutReady, lutEnabled, imageLoaded, lutUrl, imageUrl]);

  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const doRender = () => {
      requestAnimationFrame(render);
    };

    const ro = new ResizeObserver(doRender);
    ro.observe(container);
    window.addEventListener("resize", doRender);

    if (imageLoaded) doRender();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", doRender);
    };
  }, [imageLoaded, render]);

  const onImageLoad = useCallback(() => {
    setImageLoaded(true);
    requestAnimationFrame(render);
  }, [render]);

  /**
   * Canvas must mount whenever we attempt LUT (not only after lutReady), otherwise
   * the WebGL effect never sees canvasRef and getOrLoadLUT never runs — preview stays ungraded.
   */
  const canvasLayerActive =
    lutEnabled && !!lutUrl && webglAvailable !== false && !lutError;
  const lutDrawn = canvasLayerActive && lutReady;
  const objectFitClass =
    objectFit === "cover" ? "object-cover" : "object-contain";
  const isFill = variant === "fill";
  const containerBase = isFill
    ? "relative block h-full w-full min-h-0 min-w-0 overflow-hidden"
    : tileLayout === "masonry"
      ? "relative block w-full min-h-0 min-w-0"
      : tileLayout === "grid"
        ? "relative block h-full w-full min-h-0 min-w-0"
        : "relative inline-block";
  const imgClass = isFill
    ? `block h-full w-full ${objectFitClass}`
    : tileLayout === "masonry"
      ? `block w-full h-auto ${objectFitClass}`
      : tileLayout === "grid"
        ? `block h-full w-full ${objectFitClass}`
        : `block max-h-full max-w-full ${objectFitClass}`;

  if (!lutEnabled || !lutUrl || webglAvailable === false || lutError) {
    return (
      <div ref={containerRef} className={`${containerBase} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={imageUrl}
          alt={alt}
          crossOrigin={lutEnabled && lutUrl ? "anonymous" : undefined}
          className={imgClass}
          style={imageStyle}
          onLoad={onImageLoad}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`${containerBase} ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={imageUrl}
        alt={alt}
        crossOrigin={lutEnabled && lutUrl ? "anonymous" : undefined}
        className={imgClass}
        onLoad={onImageLoad}
        style={{ ...imageStyle, visibility: lutDrawn ? "hidden" : "visible" }}
      />
      {canvasLayerActive && (
        <canvas
          ref={canvasRef}
          className={`pointer-events-none absolute inset-0 block h-full w-full ${objectFitClass}`}
          style={{ opacity: lutDrawn ? 1 : 0 }}
        />
      )}
    </div>
  );
}
