"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import {
  createLUTTexture,
  createImageLUTContext,
  renderImageWithLUT,
  type ImageLUTContext,
} from "@/lib/creative-lut/image-lut-engine";
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
  const [lutReady, setLutReady] = useState(false);
  const [lutError, setLutError] = useState<string | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    setImageLoaded(false);
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !lutEnabled || !lutUrl) return;

    const gl = canvas.getContext("webgl2", { alpha: true });
    if (!gl) {
      setWebglAvailable(false);
      return;
    }
    setWebglAvailable(true);

    let cancelled = false;
    getOrLoadLUT(lutUrl)
      .then(({ data, size }) => {
        if (cancelled) return;
        const lutTexture = createLUTTexture(gl, data, size);
        glContextRef.current = createImageLUTContext(gl, lutTexture, size);
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
  }, [lutReady, lutEnabled, imageLoaded, lutUrl]);

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

  const shouldUseLUT = lutEnabled && lutUrl && lutReady && webglAvailable !== false && !lutError;
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
        className={imgClass}
        onLoad={onImageLoad}
        style={{ ...imageStyle, visibility: shouldUseLUT ? "hidden" : "visible" }}
      />
      {shouldUseLUT && (
        <canvas
          ref={canvasRef}
          className={`pointer-events-none absolute inset-0 block h-full w-full ${objectFitClass}`}
        />
      )}
    </div>
  );
}
