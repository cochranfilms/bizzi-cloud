/**
 * Single SVG silhouette: sculpted “tab” carved into the hero — flat top mid‑bar,
 * concave upper transitions (S‑curves) at both shoulders, deep pill bottom.
 * Stretched with preserveAspectRatio="none" to the live nav box.
 */
export const LANDING_SCULPTED_NAV_VIEWBOX = "0 0 1000 108";

/**
 * One closed path, CCW: deep pill base, flat top mid‑bar (y=0), quadratic “scoops”
 * at each shoulder so blue can read as flowing into the S‑curve (reference style).
 */
export const LANDING_SCULPTED_NAV_PATH =
  "M 48 108 " +
  "H 952 " +
  "C 990 108 1000 88 1000 64 " +
  "L 1000 52 " +
  "Q 952 6 898 0 " +
  "L 102 0 " +
  "Q 48 6 0 52 " +
  "L 0 64 " +
  "C 0 88 10 108 48 108 " +
  "Z";

type LandingSculptedNavBackgroundProps = {
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
