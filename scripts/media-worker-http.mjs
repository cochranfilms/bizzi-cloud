/**
 * Long-timeout JSON POST for Linux media workers (avoids Node fetch/undici HeadersTimeout
 * when Cloudflare or the origin is slow to return response headers).
 */
import * as http from "node:http";
import * as https from "node:https";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout/i.test(msg)) return true;
  if (/ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|ENOTFOUND/i.test(msg)) return true;
  return false;
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
 * POST JSON with retries on502/503/504/429 and transient network errors.
 * @param {string} apiBase no trailing slash
 * @param {string} path e.g. /api/workers/standard-proxy/claim
 * @param {string} bearerSecret
 * @param {object} body
 * @param {{ timeoutMs?: number, retries?: number }} [options]
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
        await sleep(Math.min(60_000, 1500 * 2 ** attempt));
        continue;
      }
      throw new Error(`${path} ${r.status}: ${r.text.slice(0, 500)}`);
    } catch (e) {
      lastErr = e;
      if (attempt < retries - 1 && isRetryableError(e)) {
        await sleep(Math.min(60_000, 1500 * 2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
