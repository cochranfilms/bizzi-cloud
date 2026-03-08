"use client";

import { useRef, useState, useCallback, useEffect } from "react";

interface CoverFocalPointEditorProps {
  imageUrl: string | null;
  focalX: number;
  focalY: number;
  onChange: (x: number, y: number) => void;
}

export default function CoverFocalPointEditor({
  imageUrl,
  focalX,
  focalY,
  onChange,
}: CoverFocalPointEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      setIsDragging(true);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      onChange(x, y);
    },
    [isDragging, onChange]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      setIsDragging(false);
    },
    []
  );

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
      onChange(x, y);
    },
    [onChange]
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Drag the crosshair or click on the image to set the focal point. This controls which part of the image stays visible in the banner.
      </p>
      <div
        ref={containerRef}
        role="button"
        tabIndex={0}
        onClick={handleContainerClick}
        onKeyDown={(e) => {
          const step = 5;
          if (e.key === "ArrowLeft") onChange(Math.max(0, focalX - step), focalY);
          if (e.key === "ArrowRight") onChange(Math.min(100, focalX + step), focalY);
          if (e.key === "ArrowUp") onChange(focalX, Math.max(0, focalY - step));
          if (e.key === "ArrowDown") onChange(focalX, Math.min(100, focalY + step));
        }}
        className="relative aspect-video w-full cursor-crosshair overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800"
        style={{ touchAction: "none" }}
      >
        {imageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{ objectPosition: `${focalX}% ${focalY}%` }}
              draggable={false}
            />
            <div
              className="absolute left-0 top-0 h-full w-full"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{ touchAction: "none" }}
            />
            {/* Crosshair focal point */}
            <div
              className="pointer-events-none absolute h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-lg ring-2 ring-black/30"
              style={{
                left: `${focalX}%`,
                top: `${focalY}%`,
              }}
            >
              <div
                className="absolute left-1/2 top-1/2 h-px w-6 -translate-x-1/2 -translate-y-1/2 bg-white shadow-sm"
                style={{ boxShadow: "0 0 2px rgba(0,0,0,0.5)" }}
              />
              <div
                className="absolute left-1/2 top-1/2 h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-white shadow-sm"
                style={{ boxShadow: "0 0 2px rgba(0,0,0,0.5)" }}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-400">
            Select a photo first
          </div>
        )}
      </div>
      <p className="text-xs text-neutral-400">
        Position: {Math.round(focalX)}%, {Math.round(focalY)}%
      </p>
    </div>
  );
}
