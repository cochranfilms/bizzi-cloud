/**
 * Dispatch .cube vs .3dl (and cube bodies without extension) to the correct parser.
 */

import { parseCubeFile, type ParseCubeResult } from "./parse-cube";
import { parse3dlFile } from "./parse-3dl";
import { LUT_GRID_MAX, LUT_GRID_MIN } from "./lut-limits";

export type ParseLutResult = ParseCubeResult;

export { parseCubeFile, parse3dlFile };

/**
 * Client + server: load LUT text into normalized Float32 RGBA lattice + cube size.
 * @param formatHint Use the file extension when present (`.3dl` vs `.cube`) so minimal
 *        `.3dl` exports without `3DMESH` / `Mesh` headers still parse correctly.
 */
export function parseLutFileText(text: string, formatHint?: "cube" | "3dl"): ParseLutResult {
  const body = text.replace(/^\uFEFF/, "");
  if (formatHint === "3dl") {
    return parse3dlFile(body);
  }
  if (formatHint === "cube") {
    return parseCubeFile(body);
  }
  /**
   * Prefer .3dl parser when:
   * - standard 3DMESH / Mesh headers, or
   * - OVERLAY / Earthstone-style ramp row: one line of 32+ integer knot indices (0 … 1023) before triplets.
   */
  const looks3dl =
    /\b3DMESH\b/i.test(body) ||
    /\bMesh\s+\d+\s+\d+\s+\d+\b/i.test(body) ||
    /^\s*(?:\d+\s+){31,}\d+\s*$/m.test(body);
  if (looks3dl) {
    return parse3dlFile(body);
  }
  /**
   * Minimal .3dl often has only LUT_3D_SIZE + numeric lattice (no 3DMESH, no TITLE).
   * Routing that through the .cube parser mis-counts lines and breaks validation.
   */
  const hasLut3dSize = /\bLUT_3D_SIZE\b/i.test(body);
  const hasCubeTitle = /^\s*TITLE\b/im.test(body);
  if (hasLut3dSize && !hasCubeTitle) {
    return parse3dlFile(body);
  }
  if (hasLut3dSize) {
    return parseCubeFile(body);
  }
  return parseCubeFile(body);
}

/**
 * Server-side validation before persisting an uploaded LUT.
 */
export function validateLutFileForUpload(
  text: string,
  formatHint?: "cube" | "3dl"
): { valid: true } | { valid: false; error: string } {
  try {
    const { data, size } = parseLutFileText(text, formatHint);
    if (size < LUT_GRID_MIN || size > LUT_GRID_MAX) {
      return {
        valid: false,
        error: `LUT size must be between ${LUT_GRID_MIN} and ${LUT_GRID_MAX}`,
      };
    }
    if (data.length !== size * size * size * 4) {
      return { valid: false, error: "LUT data length mismatch" };
    }
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Invalid LUT file",
    };
  }
}
