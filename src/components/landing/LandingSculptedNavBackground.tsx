/**
 * Single continuous white silhouette for the landing nav (no pseudo-element seams).
 * ViewBox is stretched with preserveAspectRatio="none" to the live nav box.
 */
export const LANDING_SCULPTED_NAV_VIEWBOX = "0 0 1000 96";

/** Symmetrical top transition + deep pill bottom; one closed path. */
export const LANDING_SCULPTED_NAV_PATH =
  "M 58 96 H 942 C 984 96 1000 78 1000 56 L 1000 52 C 1000 24 976 0 926 0 H 74 C 24 0 0 24 0 52 L 0 56 C 0 78 16 96 58 96 Z";

type LandingSculptedNavBackgroundProps = {
  /** Extra classes on the SVG (e.g. drop-shadow). */
  className?: string;
};

export default function LandingSculptedNavBackground({
  className = "block h-full w-full",
}: LandingSculptedNavBackgroundProps) {
  return (
    <svg
      className={className}
      viewBox={LANDING_SCULPTED_NAV_VIEWBOX}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path fill="#ffffff" d={LANDING_SCULPTED_NAV_PATH} />
    </svg>
  );
}
