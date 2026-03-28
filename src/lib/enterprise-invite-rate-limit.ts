/**
 * Enterprise invite rate limits: uses Redis when REDIS_URL is set (multi-instance),
 * otherwise fixed-window in-memory per Node process.
 */

import { getOptionalRedis } from "@/lib/redis-client";

const DEFAULT_WINDOW_MS = 60_000;
const REDIS_KEY_PREFIX = "bizzi:invite_rl:";

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

function checkInviteRateLimitMemory(
  kind: string,
  id: string,
  maxPerWindow: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const key = `${kind}:${id}`;
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > maxPerWindow) {
    const retryAfterSec = Math.ceil((b.windowStart + windowMs - now) / 1000);
    return { ok: false, retryAfterSec: Math.max(1, retryAfterSec) };
  }
  return { ok: true };
}

/**
 * Sliding window approximation: INCR per key with TTL = windowMs on first increment.
 */
export async function checkInviteRateLimit(
  kind: string,
  id: string,
  maxPerWindow: number,
  windowMs: number = DEFAULT_WINDOW_MS
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const redis = getOptionalRedis();
  if (redis) {
    const key = `${REDIS_KEY_PREFIX}${kind}:${id}`;
    try {
      const n = await redis.incr(key);
      if (n === 1) {
        await redis.pexpire(key, windowMs);
      }
      if (n > maxPerWindow) {
        const pttl = await redis.pttl(key);
        const retryMs = pttl > 0 ? pttl : windowMs;
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryMs / 1000)) };
      }
      return { ok: true };
    } catch (err) {
      console.warn("[invite rate limit] Redis failed, using in-memory fallback:", err);
    }
  }
  return checkInviteRateLimitMemory(kind, id, maxPerWindow, windowMs);
}
