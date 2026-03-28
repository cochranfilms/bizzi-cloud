/**
 * Optional Redis for distributed rate limits / caching (server-only).
 * Lazy singleton; safe when REDIS_URL is unset (returns null).
 */

import Redis from "ioredis";

let singleton: Redis | null | undefined;

export function getOptionalRedis(): Redis | null {
  if (singleton === undefined) {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      singleton = null;
    } else {
      singleton = new Redis(url, {
        maxRetriesPerRequest: 2,
        enableReadyCheck: true,
        lazyConnect: false,
      });
      singleton.on("error", (err) => {
        console.warn("[redis] connection error:", err.message);
      });
    }
  }
  return singleton;
}
