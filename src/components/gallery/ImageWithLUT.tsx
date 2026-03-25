"use client";

import { useRef, useEffect, useState, useCallback, type CSSProperties } from "react";
import {
  createImageLUTContext,
  disposeImageLUTContext,
  renderImageWithLUT,
  setSecondaryLut,
  swapPrimarySecondaryLut,
} from "@/lib/creative-lut/image-lut-engine";
import { computeObjectFitShaderUniforms } from "@/lib/creative-lut/object-fit-shader-uniforms";
import { lutDebug } from "@/lib/creative-lut/lut-debug";
import { getOrLoadLUT } from "@/lib/creative-lut/lut-cache";

function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

const LUT_CROSSFADE_MS = 280;

interface ImageWithLUTProps {
  imageUrl: string;
  lutUrl: string | null;
  lutEnabled: boolean;
  className?: string;
  alt?: string;
  /** "contain" (default) or "cover" for object-fit — must match the sibling &lt;img&gt; */
  objectFit?: "contain" | "cover";
  variant?: "default" | "fill";
  tileLayout?: "masonry" | "grid";
  imageStyle?: CSSProperties;
  /** 0–100, blend original → graded. Default 100 = full LUT. */
  gradeMixPercent?: number;
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
  gradeMixPercent = 100,
}: ImageWithLUTProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glContextRef = useRef<ReturnType<typeof createImageLUTContext> | null>(null);
  const displayedLutUrlRef = useRef<string | null>(null);
  const transitionRafRef = useRef<number | null>(null);
  const crossfadeRef = useRef(0);
  const loggedFirstDrawRef = useRef<string | null>(null);

  const [lutReady, setLutReady] = useState(false);
  const [lutError, setLutError] = useState<string | null>(null);
  const [webglAvailable, setWebglAvailable] = useState<boolean | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const gradeMix = Math.min(100, Math.max(0, gradeMixPercent)) / 100;

  useEffect(() => {
    setImageLoaded(false);
    loggedFirstDrawRef.current = null;
  }, [imageUrl]);

  useEffect(() => {
    if (!lutEnabled || !lutUrl) {
      if (transitionRafRef.current != null) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
      crossfadeRef.current = 0;
      if (glContextRef.current) {
        disposeImageLUTContext(glContextRef.current);
        glContextRef.current = null;
      }
      displayedLutUrlRef.current = null;
      setLutReady(false);
      setLutError(null);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      lutDebug("WebGL2 unsupported");
      setWebglAvailable(false);
      return;
    }
    setWebglAvailable(true);

    if (glContextRef.current && displayedLutUrlRef.current === lutUrl) {
      setLutReady(true);
      setLutError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data, size } = await getOrLoadLUT(lutUrl);
        if (cancelled) return;

        if (!glContextRef.current) {
          glContextRef.current = createImageLUTContext(gl, data, size);
          displayedLutUrlRef.current = lutUrl;
          crossfadeRef.current = 0;
          lutDebug("LUT GPU upload complete (primary)", { size });
        } else if (displayedLutUrlRef.current !== lutUrl) {
          if (transitionRafRef.current != null) {
            cancelAnimationFrame(transitionRafRef.current);
            transitionRafRef.current = null;
          }
          setSecondaryLut(glContextRef.current, data, size);
          crossfadeRef.current = 0;
          const ctx = glContextRef.current;
          const start = performance.now();

          const tick = () => {
            if (cancelled || !glContextRef.current) return;
            const t = Math.min(1, (performance.now() - start) / LUT_CROSSFADE_MS);
            crossfadeRef.current = easeOutQuad(t);
            requestDraw();
            if (t < 1) {
              transitionRafRef.current = requestAnimationFrame(tick);
            } else {
              transitionRafRef.current = null;
              swapPrimarySecondaryLut(ctx);
              crossfadeRef.current = 0;
              displayedLutUrlRef.current = lutUrl;
              requestDraw();
              lutDebug("LUT crossfade complete", { lutUrl: lutUrl.slice(0, 80) });
            }
          };
          transitionRafRef.current = requestAnimationFrame(tick);
          lutDebug("LUT crossfade started");
        }

        setLutError(null);
        setLutReady(true);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "LUT load failed";
          lutDebug("LUT load failed", msg);
          setLutError(msg);
          setLutReady(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (transitionRafRef.current != null) {
        cancelAnimationFrame(transitionRafRef.current);
        transitionRafRef.current = null;
      }
    };
  }, [lutEnabled, lutUrl]);

  useEffect(() => {
    return () => {
      if (transitionRafRef.current != null) {
        cancelAnimationFrame(transitionRafRef.current);
      }
      if (glContextRef.current) {
        disposeImageLUTContext(glContextRef.current);
        glContextRef.current = null;
      }
    };
  }, []);

  const requestDraw = useCallback(() => {
    requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      const ctx = glContextRef.current;
      if (!canvas || !img || !ctx || !lutReady || !lutEnabled || !imageLoaded) return;

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

      const fitUniforms = computeObjectFitShaderUniforms(
        displayedW,
        displayedH,
        img.naturalWidth,
        img.naturalHeight,
        objectFit
      );

      renderImageWithLUT(ctx, img, w, h, {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        objectFit,
        gradeMix,
        lutCrossfade: crossfadeRef.current,
        fitUniforms,
      });

      const drawKey = `${lutUrl}:${imageUrl}:${w}x${h}:${gradeMix}:${crossfadeRef.current}`;
      if (loggedFirstDrawRef.current !== drawKey) {
        loggedFirstDrawRef.current = drawKey;
        lutDebug("draw", {
          w,
          h,
          naturalW: img.naturalWidth,
          naturalH: img.naturalHeight,
          gradeMix,
          crossfade: crossfadeRef.current,
        });
      }
    });
  }, [lutReady, lutEnabled, imageLoaded, lutUrl, imageUrl, objectFit, gradeMix]);

  useEffect(() => {
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    const doRender = () => requestDraw();

    const ro = new ResizeObserver(doRender);
    ro.observe(container);
    window.addEventListener("resize", doRender);

    if (imageLoaded) doRender();

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", doRender);
    };
  }, [imageLoaded, requestDraw]);

  const onImageLoad = useCallback(() => {
    setImageLoaded(true);
    requestDraw();
  }, [requestDraw]);

  useEffect(() => {
    if (imageLoaded && lutReady) requestDraw();
  }, [gradeMix, imageLoaded, lutReady, requestDraw]);

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
          className="pointer-events-none absolute inset-0 block h-full w-full"
          style={{ opacity: lutDrawn ? 1 : 0 }}
        />
      )}
    </div>
  );
}
