/**
 * In-process single-flight for cold-miss image thumbnail generation (dedupes concurrent Sharp work).
 */

const inflight = new Map<string, Promise<void>>();

export function withThumbnailFlight(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}
