"use client";

import { useRef, useState, useCallback } from "react";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import { BANNER_ASPECT_RATIOS } from "@/lib/cover-constants";

const FOCAL_PRESETS: { label: string; x: number; y: number }[] = [
  { label: "Center", x: 50, y: 50 },
  { label: "Top", x: 50, y: 20 },
  { label: "Bottom", x: 50, y: 80 },
  { label: "Left", x: 20, y: 50 },
  { label: "Right", x: 80, y: 50 },
  { label: "Top left", x: 25, y: 25 },
  { label: "Top right", x: 75, y: 25 },
  { label: "Bottom left", x: 25, y: 75 },
  { label: "Bottom right", x: 75, y: 75 },
];

interface CoverFocalPointEditorProps {
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
  /** Banner size – adjusts crop preview aspect ratio to match gallery banner */
  bannerSize?: HeroHeightPreset | null;
}

export default function CoverFocalPointEditor({
  imageUrl,
  focalX,
  focalY,
  onChange,
  bannerSize = "medium",
}: CoverFocalPointEditorProps) {
  const aspectRatio =
    bannerSize && bannerSize in BANNER_ASPECT_RATIOS
      ? BANNER_ASPECT_RATIOS[bannerSize]
      : BANNER_ASPECT_RATIOS.medium;
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, focalX: 0, focalY: 0 });

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        focalX,
        focalY,
      };
    },
    [focalX, focalY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const SENSITIVITY = 1.5;
      const dx = ((e.clientX - dragStartRef.current.x) / rect.width) * 100 * SENSITIVITY;
      const dy = ((e.clientY - dragStartRef.current.y) / rect.height) * 100 * SENSITIVITY;
      const newX = Math.max(0, Math.min(100, dragStartRef.current.focalX - dx));
      const newY = Math.max(0, Math.min(100, dragStartRef.current.focalY - dy));
      onChange(newX, newY);
    },
    [isDragging, onChange]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
  }, []);

  const handlePointerLeave = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Click and drag the image to position it. The visible area in the banner follows where you place it.
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        <strong>Safe zone:</strong> Keep faces, logos, and important subjects in the center area. On mobile, the image crops more on the sides.
      </p>
      <div
        ref={containerRef}
        role="slider"
        tabIndex={0}
        aria-label={`Crop position: ${Math.round(focalX)}% horizontal, ${Math.round(focalY)}% vertical`}
        aria-valuenow={focalX}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(e) => {
          const step = 5;
          if (e.key === "ArrowLeft") onChange(Math.max(0, focalX - step), focalY);
          if (e.key === "ArrowRight") onChange(Math.min(100, focalX + step), focalY);
          if (e.key === "ArrowUp") onChange(focalX, Math.max(0, focalY - step));
          if (e.key === "ArrowDown") onChange(focalX, Math.min(100, focalY + step));
        }}
        className={`relative w-full overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          aspectRatio: `${aspectRatio} / 1`,
          touchAction: "none",
        }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full select-none object-cover"
              style={{
                objectPosition: `${focalX}% ${focalY}%`,
                pointerEvents: "none",
              }}
              draggable={false}
            />
            {/* Safe zone overlay: center 60% — keep subjects here */}
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
              aria-hidden
            >
              <div
                className="w-[60%] rounded border-2 border-dashed border-white/80"
                style={{ aspectRatio: `${aspectRatio} / 1` }}
              />
            </div>
            <div
              className="absolute inset-0 z-10 cursor-grab"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerLeave}
              style={{ touchAction: "none" }}
              aria-hidden
            />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            Select a photo first
          </div>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        Position: {Math.round(focalX)}%, {Math.round(focalY)}% — drag to adjust
      </p>
      <div className="flex flex-wrap gap-1">
        {FOCAL_PRESETS.map(({ label, x, y }) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(x, y)}
            className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
