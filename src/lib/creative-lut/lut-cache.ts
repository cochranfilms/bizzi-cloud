/**
 * Client-side LUT cache - avoids re-fetching and re-parsing the same LUT
 * across multiple ImageWithLUT/VideoWithLUT instances in a session.
 */

import { getBuiltinLUTUrl } from "./builtin-registry";
import { parseCubeFile } from "./parse-cube";

const MAX_CACHE_ENTRIES = 5;
const cache = new Map<string, { data: Float32Array; size: number }>();
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

export async function getOrLoadLUT(
  urlOrBuiltinId: string
): Promise<Float32Array> {
  const resolved = resolveUrl(urlOrBuiltinId);

  const cached = cache.get(resolved);
  if (cached) {
    const idx = accessOrder.indexOf(resolved);
    if (idx >= 0) {
      accessOrder.splice(idx, 1);
    }
    accessOrder.push(resolved);
    return cached.data;
  }

  const res = await fetch(resolved);
  if (!res.ok) throw new Error(`Failed to load LUT: ${res.status}`);
  const text = await res.text();
  const data = parseCubeFile(text);
  const size = Math.round(Math.cbrt(data.length / 4)) || 33;

  evictLRU();
  cache.set(resolved, { data, size });
  accessOrder.push(resolved);

  return data;
}

export function clearLutCache(): void {
  cache.clear();
  accessOrder.length = 0;
}
