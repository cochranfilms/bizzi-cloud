/**
 * Long-timeout JSON POST for Linux media workers (avoids Node fetch/undici HeadersTimeout
 * when Cloudflare or the origin is slow to return response headers).
 */
import * as http from "node:http";
import * as https from "node:https";

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Uniform jitter in [0, maxExclusive). */
export function randomJitterMs(maxExclusive) {
  const m = Math.max(0, Math.floor(maxExclusive));
  return m <= 0 ? 0 : Math.floor(Math.random() * m);
}

/**
 * Idle polling delay when the server returned no work (spread load across workers).
 * @param {number} baseMs
 * @param {number} jitterMaxExclusive
 */
export function idlePollMs(baseMs = 5000, jitterMaxExclusive = 2000) {
  return baseMs + randomJitterMs(jitterMaxExclusive);
}

/**
 * Outer-loop backoff after transport / unexpected API failures (exponential + jitter, capped).
 * @param {number} attemptZeroBased
 * @param {{ baseMs?: number, maxMs?: number, jitterMaxExclusive?: number }} [opts]
 */
export function transportBackoffMs(attemptZeroBased, opts = {}) {
  const base = opts.baseMs ?? 2000;
  const max = opts.maxMs ?? 120_000;
  const jitterMax = opts.jitterMaxExclusive ?? 4000;
  const exp = Math.min(max, base * 2 ** Math.min(attemptZeroBased, 20));
  return exp + randomJitterMs(jitterMax);
}

function isRetryableError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) return true;
  if (/ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENOTFOUND|socket hang up/i.test(msg)) return true;
  return false;
}

function retryDelayAfterAttempt(attempt, options) {
  const base = options.backoffBaseMs ?? 1500;
  const cap = options.backoffMaxMs ?? 120_000;
  const jitterMax = options.retryJitterMax ?? 800;
  const exp = Math.min(cap, base * 2 ** attempt);
  return exp + randomJitterMs(jitterMax);
}

/**
 * @param {string} urlString
 * @param {{ method: string, headers: Record<string, string>, body?: string, timeoutMs: number }} opts
 */
function httpRequest(urlString, opts) {
  const { method, headers, body, timeoutMs } = opts;
  return new Promise((resolve, reject) => {
    let settled = false;
    const url = new URL(urlString);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          settled = true;
          const text = Buffer.concat(chunks).toString();
          resolve({ status: res.statusCode ?? 0, text, headers: res.headers });
        });
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
    });
    req.on("error", (e) => {
      if (!settled) reject(e);
    });
    if (body) req.write(body);
    req.end();
  });
}

/**
 * POST JSON with retries on 502/503/504/429 and transient network errors.
 * @param {string} apiBase no trailing slash
 * @param {string} path e.g. /api/workers/standard-proxy/claim
 * @param {string} bearerSecret
 * @param {object} body
 * @param {{
 *   timeoutMs?: number,
 *   retries?: number,
 *   backoffBaseMs?: number,
 *   backoffMaxMs?: number,
 *   retryJitterMax?: number,
 * }} [options]
 */
export async function postWorkerJson(apiBase, path, bearerSecret, body, options = {}) {
  const timeoutMs = options.timeoutMs ?? 600_000;
  const retries = options.retries ?? 6;
  const url = `${apiBase.replace(/\/$/, "")}${path}`;
  const payload = JSON.stringify(body);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearerSecret}`,
    "Content-Length": String(Buffer.byteLength(payload)),
  };

  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const r = await httpRequest(url, {
        method: "POST",
        headers,
        body: payload,
        timeoutMs,
      });
      if (r.status >= 200 && r.status < 300) {
        try {
          return JSON.parse(r.text);
        } catch {
          return { raw: r.text };
        }
      }
      const retryable =
        r.status === 502 ||
        r.status === 503 ||
        r.status === 504 ||
        r.status === 429 ||
        r.status === 520 ||
        r.status === 521 ||
        r.status === 522;
      if (retryable && attempt < retries - 1) {
        await sleep(retryDelayAfterAttempt(attempt, options));
        continue;
      }
      throw new Error(`${path} ${r.status}: ${r.text.slice(0, 500)}`);
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1 && isRetryableError(e)) {
        await sleep(retryDelayAfterAttempt(attempt, options));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

/**
 * Claim endpoints return small JSON quickly; use a shorter per-request timeout and gentler
 * exponential retries (jitter) so workers do not hammer the origin on outages.
 * @param {string} apiBase
 * @param {string} path
 * @param {string} bearerSecret
 * @param {object} body
 * @param {Parameters<typeof postWorkerJson>[4]} [options]
 */
export async function postWorkerClaimJson(apiBase, path, bearerSecret, body, options = {}) {
  return postWorkerJson(apiBase, path, bearerSecret, body, {
    timeoutMs: 90_000,
    retries: 8,
    backoffBaseMs: 2000,
    backoffMaxMs: 90_000,
    retryJitterMax: 2000,
    ...options,
  });
}
