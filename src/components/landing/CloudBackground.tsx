"use client";

/** Solid marketing gradient only (no cloud shapes). Always light via `globals.css`. */
export default function CloudBackground() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="landing-page-shell absolute inset-0" />
    </div>
  );
}
