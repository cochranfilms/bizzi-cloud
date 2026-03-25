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
 */
export function parseLutFileText(text: string): ParseLutResult {
  if (/\bLUT_3D_SIZE\b/i.test(text)) {
    return parseCubeFile(text);
  }
  if (/\b3DMESH\b/i.test(text) || /\bMesh\s+\d+\s+\d+\s+\d+\b/i.test(text)) {
    return parse3dlFile(text);
  }
  return parseCubeFile(text);
}

/**
 * Server-side validation before persisting an uploaded LUT.
 */
export function validateLutFileForUpload(text: string): { valid: true } | { valid: false; error: string } {
  try {
    const { data, size } = parseLutFileText(text);
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
