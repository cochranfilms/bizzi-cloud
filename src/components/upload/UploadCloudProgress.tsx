"use client";

import { memo, useId } from "react";

/** Lucide `cloud` silhouette (24×24 grid). */
const CLOUD_D =
  "M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z";

export type UploadCloudProgressProps = {
  /** 0–100 upload progress */
  progress: number;
  error?: boolean;
  /** File finished successfully */
  complete?: boolean;
  className?: string;
  /** Larger hit area for grid cards vs compact queue rows */
  size?: "sm" | "md";
};

/**
 * Cloud icon that fills bottom → top. Progress uses the same white-leaning fill as the
 * Uppy StatusBar cloud (`--bizzi-uppy-statusbar-cloud-fill-progress` under `.bizzi-uppy-theme`).
 */
export const UploadCloudProgress = memo(function UploadCloudProgress({
  progress,
  error = false,
  complete = false,
  className = "",
  size = "md",
}: UploadCloudProgressProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `bizzi-uppy-cloud-clip-${uid}`;
  const pct = complete ? 100 : Math.max(0, Math.min(100, progress));
  const vb = 24;
  const fillTop = vb * (1 - pct / 100);
  const fillH = vb * (pct / 100);

  const dimOpacity = error ? 0.38 : 0.26;
  const hClass = size === "sm" ? "h-5 w-7" : "h-7 w-9";

  const basePathStyle = error
    ? ({ fill: "currentColor", opacity: dimOpacity } as const)
    : ({
        fill: "color-mix(in srgb, var(--bizzi-uppy-statusbar-cloud-dim, var(--bizzi-uppy-primary)) 82%, transparent)",
      } as const);

  const progressPathStyle = error
    ? ({ fill: "currentColor", opacity: 0.88 } as const)
    : ({
        fill: "var(--bizzi-uppy-statusbar-cloud-fill-progress, color-mix(in srgb, #ffffff 84%, var(--bizzi-uppy-primary) 16%))",
      } as const);

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${hClass} ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ color: error ? "rgb(239 68 68)" : "var(--bizzi-uppy-primary)" }}
    >
      <svg viewBox="0 0 24 24" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <rect x="0" y={fillTop} width={vb} height={Math.max(fillH, pct > 0 ? 0.02 : 0)} />
          </clipPath>
        </defs>
        <path d={CLOUD_D} style={basePathStyle} />
        {pct > 0 ? <path d={CLOUD_D} style={progressPathStyle} clipPath={`url(#${clipId})`} /> : null}
        <path
          d={CLOUD_D}
          fill="none"
          stroke="currentColor"
          strokeOpacity={error ? 0.55 : complete ? 0.72 : 0.45}
          strokeWidth={complete && !error ? 1 : 0.9}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
});
