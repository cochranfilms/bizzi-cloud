/**
 * Shared CUBE file parser for 3D LUTs.
 * CUBE format: LUT_3D_SIZE N, then N³ lines of "R G B" (R varies fastest).
 */

import { LUT_GRID_MAX, LUT_GRID_MIN } from "./lut-limits";

export interface ParseCubeResult {
  data: Float32Array;
  size: number;
}

export function parseCubeFile(text: string): ParseCubeResult {
  const lines = text.trim().split(/\r?\n/);
  let size = 0;
  const values: number[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("TITLE") || trimmed.startsWith("#"))
      continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0] === "LUT_3D_SIZE" && parts[1]) {
      size = parseInt(parts[1], 10);
      continue;
    }
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        values.push(r, g, b, 1);
      }
    }
  }

  if (size === 0) size = Math.round(Math.cbrt(values.length / 4)) || 33;
  return { data: new Float32Array(values), size };
}

/**
 * Validate CUBE structure (for server-side validation).
 * Returns { valid: true } or { valid: false, error: string }.
 */
export function validateCubeStructure(text: string): { valid: true } | { valid: false; error: string } {
  const lines = text.trim().split(/\r?\n/);
  let size = 0;
  let rgbCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("TITLE") || trimmed.startsWith("#"))
      continue;
    const parts = trimmed.split(/\s+/);
    if (parts[0] === "LUT_3D_SIZE" && parts[1]) {
      const n = parseInt(parts[1], 10);
      if (!Number.isInteger(n) || n < LUT_GRID_MIN || n > LUT_GRID_MAX) {
        return { valid: false, error: "Invalid LUT_3D_SIZE" };
      }
      size = n;
      continue;
    }
    if (parts.length >= 3) {
      const r = parseFloat(parts[0]);
      const g = parseFloat(parts[1]);
      const b = parseFloat(parts[2]);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        rgbCount++;
      }
    }
  }

  const expectedSize = size || Math.round(Math.cbrt(rgbCount / 4)) || 33;
  const expectedCount = expectedSize * expectedSize * expectedSize;
  if (rgbCount < expectedCount) {
    return {
      valid: false,
      error: `Insufficient RGB values: got ${rgbCount}, expected at least ${expectedCount}`,
    };
  }

  return { valid: true };
}
