"use client";

import type { CSSProperties } from "react";

/** Matches `public/logo.png` — layer placement derived from composite + asset bboxes. */
const LOGO = { w: 1224, h: 1482 };
/** Cyan bolt region in composite (same pixel size as `lightning.png`). */
const LIGHTNING_FRAME = { left: 0, top: 0, width: 861, height: 1476 };
/** Black “B” region in composite (`bbox` of dark opaque pixels in logo.png). */
const B_FRAME = { left: 50, top: 9, width: 1174, height: 1472 };

function pct(part: number, whole: number): string {
  return `${(100 * part) / whole}%`;
}

const MASK_FILL: CSSProperties = {
  maskRepeat: "no-repeat",
  maskSize: "100% 100%",
  maskPosition: "center",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskSize: "100% 100%",
  WebkitMaskPosition: "center",
};

type WorkspaceLogoMarkProps = {
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
  /** Accessible name for the mark */
  alt?: string;
};

/**
 * Two-layer mark using `/B.png` and `/lightning.png` with CSS masks so each part can be tinted via
 * `--dashboard-logo-icon` and `--dashboard-logo-lightning`. Geometry matches `logo.png` instead of
 * independently centering each asset in the box (which misaligned the bolt).
 */
export default function WorkspaceLogoMark({
  width,
  height,
  className = "",
  style,
  alt = "Bizzi",
}: WorkspaceLogoMarkProps) {
  return (
    <span
      className={`inline-flex flex-shrink-0 items-center justify-center ${className}`.trim()}
      style={{ width, height, ...style }}
      role="img"
      aria-label={alt}
    >
      <span
        className="relative block max-h-full max-w-full"
        style={{
          aspectRatio: `${LOGO.w} / ${LOGO.h}`,
          height: "100%",
          width: "auto",
        }}
      >
        {/* Lightning: lower layer; placed in left column like composite logo */}
        <span
          className="pointer-events-none absolute block"
          aria-hidden
          style={{
            ...MASK_FILL,
            left: pct(LIGHTNING_FRAME.left, LOGO.w),
            top: pct(LIGHTNING_FRAME.top, LOGO.h),
            width: pct(LIGHTNING_FRAME.width, LOGO.w),
            height: pct(LIGHTNING_FRAME.height, LOGO.h),
            backgroundColor: "var(--dashboard-logo-lightning, #00BFFF)",
            maskImage: "url(/lightning.png)",
            WebkitMaskImage: "url(/lightning.png)",
          }}
        />
        {/* B mark on top */}
        <span
          className="pointer-events-none absolute block"
          aria-hidden
          style={{
            ...MASK_FILL,
            left: pct(B_FRAME.left, LOGO.w),
            top: pct(B_FRAME.top, LOGO.h),
            width: pct(B_FRAME.width, LOGO.w),
            height: pct(B_FRAME.height, LOGO.h),
            backgroundColor: "var(--dashboard-logo-icon, #ffffff)",
            maskImage: "url(/B.png)",
            WebkitMaskImage: "url(/B.png)",
          }}
        />
      </span>
    </span>
  );
}
