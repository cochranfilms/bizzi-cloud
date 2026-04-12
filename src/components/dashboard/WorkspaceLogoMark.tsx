"use client";

import type { CSSProperties } from "react";

const MASK: CSSProperties = {
  maskRepeat: "no-repeat",
  maskPosition: "center",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  WebkitMaskSize: "contain",
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
 * `--dashboard-logo-icon` and `--dashboard-logo-lightning` (set by DashboardAppearanceProvider).
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
      className={`relative inline-block flex-shrink-0 ${className}`.trim()}
      style={{ width, height, ...style }}
      role="img"
      aria-label={alt}
    >
      {/* Lightning under the icon shape so cutouts read correctly */}
      <span
        className="pointer-events-none absolute inset-0 block"
        aria-hidden
        style={{
          ...MASK,
          backgroundColor: "var(--dashboard-logo-lightning, #00BFFF)",
          maskImage: "url(/lightning.png)",
          WebkitMaskImage: "url(/lightning.png)",
        }}
      />
      <span
        className="pointer-events-none absolute inset-0 block"
        aria-hidden
        style={{
          ...MASK,
          backgroundColor: "var(--dashboard-logo-icon, #ffffff)",
          maskImage: "url(/B.png)",
          WebkitMaskImage: "url(/B.png)",
        }}
      />
    </span>
  );
}
