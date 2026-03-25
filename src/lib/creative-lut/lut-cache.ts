/**
 * Client-side LUT cache - avoids re-fetching and re-parsing the same LUT
 * across multiple ImageWithLUT/VideoWithLUT instances in a session.
 */

import { getBuiltinLUTUrl } from "./builtin-registry";
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
  const resolved = resolveUrl(urlOrBuiltinId);

  const cached = cache.get(resolved);
  if (cached) {
    const idx = accessOrder.indexOf(resolved);
    if (idx >= 0) {
      accessOrder.splice(idx, 1);
    }
    accessOrder.push(resolved);
    return cached;
  }

  const res = await fetch(resolved);
  if (!res.ok) throw new Error(`Failed to load LUT: ${res.status}`);
  const text = await res.text();
  const pathOnly = resolved.split(/[?#]/)[0]?.toLowerCase() ?? "";
  const formatHint = pathOnly.endsWith(".3dl") ? ("3dl" as const) : pathOnly.endsWith(".cube") ? ("cube" as const) : undefined;
  const { data, size } = parseLutFileText(text, formatHint);

  evictLRU();
  const entry = { data, size };
  cache.set(resolved, entry);
  accessOrder.push(resolved);

  return entry;
}

export function clearLutCache(): void {
  cache.clear();
  accessOrder.length = 0;
}
