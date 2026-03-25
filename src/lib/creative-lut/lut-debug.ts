/**
 * Optional LUT pipeline diagnostics. Enable with:
 *   localStorage.setItem("bizziDebugLut", "1")
 * or NEXT_PUBLIC_DEBUG_LUT=1 at build time.
 */

export const BIZZI_TEST_INVERT_LUT_ID = "__bizzi_test_invert__";

function isLutDebugEnabled(): boolean {
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG_LUT === "1") {
    return true;
  }
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem("bizziDebugLut") === "1";
  } catch {
    return false;
  }
}

export function lutDebug(message: string, data?: unknown): void {
  if (!isLutDebugEnabled()) return;
  if (data !== undefined) console.info(`[bizzi LUT] ${message}`, data);
  else console.info(`[bizzi LUT] ${message}`);
}

/** Obvious color invert (0→1 lattice) to verify WebGL + texture layout; size 32. */
export function makeInvertDiagnosticLut(size: number): {
  data: Float32Array;
  size: number;
} {
  const n = size;
  const values: number[] = [];
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        const rf = n > 1 ? r / (n - 1) : 0;
        const gf = n > 1 ? g / (n - 1) : 0;
        const bf = n > 1 ? b / (n - 1) : 0;
        values.push(1 - rf, 1 - gf, 1 - bf, 1);
      }
    }
  }
  return { data: new Float32Array(values), size: n };
}

export function summarizeLutData(data: Float32Array, size: number): {
  size: number;
  samples: number;
  cornerRgb: number[];
  midRgb: number[];
} {
  const mid = Math.floor((size * size * size) / 2);
  return {
    size,
    samples: size * size * size,
    cornerRgb: [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0],
    midRgb: [
      data[mid * 4] ?? 0,
      data[mid * 4 + 1] ?? 0,
      data[mid * 4 + 2] ?? 0,
    ],
  };
}
