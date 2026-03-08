/**
 * Compute CSS object-position from gallery cover settings.
 * Supports custom focal point (cover_focal_x, cover_focal_y) or legacy preset.
 */
import type { CoverPosition } from "@/types/gallery";

const PRESET_MAP: Record<CoverPosition, string> = {
  "top left": "0% 0%",
  top: "50% 0%",
  "top right": "100% 0%",
  left: "0% 50%",
  center: "50% 50%",
  right: "100% 50%",
  "bottom left": "0% 100%",
  bottom: "50% 100%",
  "bottom right": "100% 100%",
};

export function getCoverObjectPosition(
  opts: {
    cover_focal_x?: number | null;
    cover_focal_y?: number | null;
    cover_position?: CoverPosition | string | null;
  } = {}
): string {
  const { cover_focal_x, cover_focal_y, cover_position } = opts;
  if (
    typeof cover_focal_x === "number" &&
    typeof cover_focal_y === "number"
  ) {
    const x = Math.max(0, Math.min(100, cover_focal_x));
    const y = Math.max(0, Math.min(100, cover_focal_y));
    return `${x}% ${y}%`;
  }
  if (cover_position && cover_position in PRESET_MAP) {
    return PRESET_MAP[cover_position as CoverPosition];
  }
  return "50% 50%";
}
