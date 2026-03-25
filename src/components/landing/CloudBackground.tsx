"use client";

import { LANDING_PAGE_GRADIENT } from "@/lib/landing-gradient";

/** Solid marketing gradient only (no cloud shapes). */
export default function CloudBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="absolute inset-0"
        style={{ background: LANDING_PAGE_GRADIENT }}
      />
    </div>
  );
}
