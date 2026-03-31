/**
 * Client-side LUT cache - avoids re-fetching and re-parsing the same LUT
 * across multiple ImageWithLUT/VideoWithLUT instances in a session.
 */

import { filePreviewLutDebugEnabled } from "@/lib/file-preview-lut-debug";
import { getBuiltinLUTUrl } from "./builtin-registry";
import {
  BIZZI_TEST_INVERT_LUT_ID,
  lutDebug,
  makeInvertDiagnosticLut,
  summarizeLutData,
} from "./lut-debug";
import { parseLutFileText } from "./parse-lut";

const MAX_CACHE_ENTRIES = 5;
export type LoadedLUT = { data: Float32Array; size: number };

const cache = new Map<string, LoadedLUT>();
const accessOrder: string[] = [];

function resolveUrl(key: string): string {
  const builtinUrl = getBuiltinLUTUrl(key);
  if (builtinUrl) return new URL(builtinUrl, window.location.origin).href;
  return key;
}

function evictLRU(): void {
  if (accessOrder.length >= MAX_CACHE_ENTRIES) {
    const oldest = accessOrder.shift();
    if (oldest) cache.delete(oldest);
  }
}

export async function getOrLoadLUT(urlOrBuiltinId: string): Promise<LoadedLUT> {
  if (urlOrBuiltinId === BIZZI_TEST_INVERT_LUT_ID) {
    lutDebug("parse: built-in invert diagnostic LUT (no fetch)");
    const entry = makeInvertDiagnosticLut(32);
    lutDebug("parsed lattice", summarizeLutData(entry.data, entry.size));
    return entry;
  }

  const isBuiltinId = getBuiltinLUTUrl(urlOrBuiltinId) != null;
  const resolved = resolveUrl(urlOrBuiltinId);

  const cached = cache.get(resolved);
  if (cached) {
    if (filePreviewLutDebugEnabled() && isBuiltinId) {
      console.info("[LUT cache] builtin load OK (cache hit)", {
        id: urlOrBuiltinId,
        resolved,
        latticeSize: cached.size,
      });
    }
    const idx = accessOrder.indexOf(resolved);
    if (idx >= 0) {
      accessOrder.splice(idx, 1);
    }
    accessOrder.push(resolved);
    return cached;
  }

  let res: Response;
  try {
    res = await fetch(resolved);
  } catch (e) {
    if (filePreviewLutDebugEnabled() && isBuiltinId) {
      console.warn("[LUT cache] builtin fetch failed (network)", {
        id: urlOrBuiltinId,
        resolved,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
  if (!res.ok) {
    if (filePreviewLutDebugEnabled() && isBuiltinId) {
      console.warn("[LUT cache] builtin fetch failed (HTTP)", {
        id: urlOrBuiltinId,
        resolved,
        status: res.status,
      });
    }
    throw new Error(`Failed to load LUT: ${res.status}`);
  }
  const text = await res.text();

  let formatHint: "cube" | "3dl" | undefined;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(resolved, base);
    const q = u.searchParams.get("lut_format");
    if (q === "3dl" || q === "cube") formatHint = q;
  } catch {
    /* ignore */
  }
  if (!formatHint) {
    const pathOnly = resolved.split(/[?#]/)[0]?.toLowerCase() ?? "";
    formatHint = pathOnly.endsWith(".3dl")
      ? "3dl"
      : pathOnly.endsWith(".cube")
        ? "cube"
        : undefined;
  }
  let data: Float32Array;
  let size: number;
  try {
    const parsed = parseLutFileText(text, formatHint);
    data = parsed.data;
    size = parsed.size;
  } catch (e) {
    if (filePreviewLutDebugEnabled() && isBuiltinId) {
      console.warn("[LUT cache] builtin parse failed", {
        id: urlOrBuiltinId,
        resolved,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw e;
  }
  lutDebug("parsed LUT file", {
    ...summarizeLutData(data, size),
    formatHint: formatHint ?? "auto",
  });

  evictLRU();
  const entry = { data, size };
  cache.set(resolved, entry);
  accessOrder.push(resolved);

  if (filePreviewLutDebugEnabled() && isBuiltinId) {
    console.info("[LUT cache] builtin load OK", {
      id: urlOrBuiltinId,
      resolved,
      latticeSize: size,
    });
  }

  return entry;
}

export function clearLutCache(): void {
  cache.clear();
  accessOrder.length = 0;
}
