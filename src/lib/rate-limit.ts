/**
 * Simple in-memory rate limiter for sensitive API endpoints.
 * Note: In serverless (Vercel), each instance has its own memory; this provides
 * per-instance protection. For cross-instance limiting, use Upstash Redis.
 */

const store = new Map<string, { count: number; resetAt: number }>();
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, val] of store.entries()) {
    if (val.resetAt < now) store.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit. Returns { allowed, remaining, resetAt }.
 * @param key - Unique key (e.g. `uid:${uid}` or `ip:${ip}`)
 * @param limit - Max requests per window
 * @param windowMs - Window duration in ms
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  cleanup();
  const now = Date.now();
  const entry = store.get(key);
  if (!entry) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  if (entry.resetAt < now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }
  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  return {
    allowed: entry.count <= limit,
    remaining,
    resetAt: entry.resetAt,
  };
}
