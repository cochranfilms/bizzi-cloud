/**
 * ASCII .3dl (Autodesk / Adobe / Resolve-style) 3D LUT parser.
 * Output matches .cube: Float32 RGBA lattice, R varies fastest, G, then B.
 * Line order per lattice matches standard cube body ordering.
 */

import type { ParseCubeResult } from "./parse-cube";
import { LUT_GRID_MAX, LUT_GRID_MIN } from "./lut-limits";

function normalizeTripletChannel(v: number, maxSample: number): number {
  if (maxSample <= 1.001) return Math.min(1, Math.max(0, v));
  if (maxSample <= 255.5) return Math.min(1, Math.max(0, v / 255));
  if (maxSample <= 1023.5) return Math.min(1, Math.max(0, v / 1023));
  if (maxSample <= 4095.5) return Math.min(1, Math.max(0, v / 4095));
  return Math.min(1, Math.max(0, v / maxSample));
}

/**
 * Parse .3dl text: headers (3DMESH, Mesh N N N, DOMAIN_*, KEYWORD), comments, then N³ RGB lines.
 */
export function parse3dlFile(text: string): ParseCubeResult {
  const lines = text.split(/\r?\n/);
  let meshSize = 0;
  const triplets: [number, number, number][] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const low = trimmed.toLowerCase();
    if (low.startsWith("#")) continue;
    if (low === "3dmesh") continue;
    if (/^title\s+/i.test(trimmed)) continue;
    if (/^keyword\s+/i.test(trimmed)) continue;
    if (/^domain_min\b/i.test(trimmed)) continue;
    if (/^domain_max\b/i.test(trimmed)) continue;
    if (/^lut_3d_input_range\b/i.test(trimmed)) continue;
    if (/^lut_3d_output_range\b/i.test(trimmed)) continue;
    const lut3dSize = trimmed.match(/^lut_3d_size\s+(\d+)/i);
    if (lut3dSize) {
      const n = parseInt(lut3dSize[1], 10);
      if (n >= LUT_GRID_MIN && n <= LUT_GRID_MAX) meshSize = n;
      continue;
    }

    const meshMatch = trimmed.match(/^Mesh\s+(\d+)\s+(\d+)\s+(\d+)\s*$/i);
    if (meshMatch) {
      const a = parseInt(meshMatch[1], 10);
      const b = parseInt(meshMatch[2], 10);
      const c = parseInt(meshMatch[3], 10);
      if (a === b && b === c && a >= LUT_GRID_MIN && a <= LUT_GRID_MAX) {
        meshSize = a;
      }
      continue;
    }

    const loneGrid = trimmed.match(/^(\d+)\s*$/);
    if (loneGrid && meshSize === 0) {
      const n = parseInt(loneGrid[1], 10);
      if (n >= LUT_GRID_MIN && n <= LUT_GRID_MAX) {
        meshSize = n;
        continue;
      }
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length < 3) continue;

    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) continue;

    triplets.push([r, g, b]);
  }

  if (triplets.length === 0) {
    throw new Error("No RGB triplets found in .3dl file");
  }

  const approxEqual = (a: number, b: number, eps = 1e-2) => Math.abs(a - b) < eps;

  // Resolve / many exporters: first row is "N N N" grid size (not a color sample), often as N³+1 lines total (e.g. 32³+1 = 32769).
  if (meshSize === 0 && triplets.length > 0) {
    const [fr, fg, fb] = triplets[0];
    const n = Math.round(fr);
    if (
      approxEqual(fr, fg) &&
      approxEqual(fg, fb) &&
      n >= LUT_GRID_MIN &&
      n <= LUT_GRID_MAX &&
      approxEqual(fr, n) &&
      triplets.length === n * n * n + 1
    ) {
      triplets.shift();
      meshSize = n;
    }
  }

  if (meshSize === 0) {
    let n = Math.round(Math.cbrt(triplets.length)) || 0;
    if (n >= LUT_GRID_MIN && n <= LUT_GRID_MAX && n * n * n === triplets.length) {
      meshSize = n;
    } else {
      n = Math.round(Math.cbrt(triplets.length - 1)) || 0;
      if (
        n >= LUT_GRID_MIN &&
        n <= LUT_GRID_MAX &&
        n * n * n + 1 === triplets.length &&
        triplets.length > 0
      ) {
        const [fr, fg, fb] = triplets[0]!;
        if (approxEqual(fr, n) && approxEqual(fg, n) && approxEqual(fb, n)) {
          triplets.shift();
          meshSize = n;
        }
      }
    }
    if (meshSize === 0) {
      throw new Error(
        `.3dl entry count ${triplets.length} is not a perfect cube (expected N³ for N = ${LUT_GRID_MIN}…${LUT_GRID_MAX})`
      );
    }
  } else {
    const expected = meshSize * meshSize * meshSize;
    /** Leading "N N N" size row after Mesh header (Resolve / many exporters). */
    if (triplets.length === expected + 1) {
      const [r, g, b] = triplets[0]!;
      const matchesN =
        approxEqual(r, meshSize) && approxEqual(g, meshSize) && approxEqual(b, meshSize);
      if (matchesN) {
        triplets.shift();
      }
    }
    if (triplets.length < expected) {
      throw new Error(
        `.3dl expected ${expected} RGB rows for size ${meshSize}, got ${triplets.length}`
      );
    }
    if (triplets.length > expected) {
      triplets.length = expected;
    }
  }

  let maxSample = 0;
  for (const [r, g, b] of triplets) {
    maxSample = Math.max(maxSample, r, g, b);
  }

  const values: number[] = [];
  for (const [r, g, b] of triplets) {
    values.push(
      normalizeTripletChannel(r, maxSample),
      normalizeTripletChannel(g, maxSample),
      normalizeTripletChannel(b, maxSample),
      1
    );
  }

  return { data: new Float32Array(values), size: meshSize };
}

export function validate3dlStructure(text: string): { valid: true } | { valid: false; error: string } {
  try {
    const { data, size } = parse3dlFile(text);
    if (size < LUT_GRID_MIN || size > LUT_GRID_MAX) {
      return {
        valid: false,
        error: `LUT_3D size must be between ${LUT_GRID_MIN} and ${LUT_GRID_MAX}`,
      };
    }
    if (data.length !== size * size * size * 4) {
      return { valid: false, error: "LUT data length mismatch" };
    }
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : "Invalid .3dl file",
    };
  }
}
