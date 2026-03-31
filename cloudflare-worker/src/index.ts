/**
 * Bizzi Cloud CDN Worker - proxies B2 downloads through Cloudflare for free B2 egress (Bandwidth Alliance).
 */

export interface Env {
  API_BASE_URL: string;
}

const ALLOWED_ORIGINS = [
  "https://www.bizzicloud.io",
  "https://bizzicloud.io",
  "http://localhost:3000",
];

function corsHeaders(origin: string | null): Headers {
  const h = new Headers();
  const allowOrigin =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  h.set("Access-Control-Allow-Origin", allowOrigin);
  h.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");
  h.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Range");
  return h;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    const objectKey = decodeURIComponent(url.pathname.slice(1));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    const downloadFilename = url.searchParams.get("download") ?? undefined;
    const inlinePreview = url.searchParams.get("inline") === "1" && !downloadFilename;

    if (!objectKey || !exp || !sig) {
      return new Response("Missing object_key, exp, or sig", { status: 400 });
    }

    const apiBase = env.API_BASE_URL?.replace(/\/$/, "") || "https://bizzicloud.io";
    const presignedUrl = `${apiBase}/api/cdn-presigned?object_key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${encodeURIComponent(sig)}${downloadFilename ? `&download=${encodeURIComponent(downloadFilename)}` : ""}${inlinePreview ? "&inline=1" : ""}`;

    const rangeHeader = request.headers.get("Range");
    /** Separate keys: presigned URLs differ in Content-Disposition (inline vs attachment vs default). */
    const cacheMode = downloadFilename ? `d:${downloadFilename}` : inlinePreview ? "i" : "n";
    const cacheKey = rangeHeader
      ? `cdn:${objectKey}:${cacheMode}:${rangeHeader}`
      : `cdn:${objectKey}:${cacheMode}`;

    // Check edge cache first (reduces B2 egress and Cloudflare bandwidth)
    const cache = caches.default;
    const cacheRequest = new Request(`https://cdn-cache/${cacheKey}`, {
      method: "GET",
    });
    const cachedRes = await cache.match(cacheRequest);
    if (cachedRes) {
      const headers = new Headers(cachedRes.headers);
      cors.forEach((v, k) => headers.set(k, v));
      return new Response(cachedRes.body, {
        status: cachedRes.status,
        statusText: cachedRes.statusText,
        headers,
      });
    }

    const fetchOpts: RequestInit = {
      method: "GET",
      headers: rangeHeader ? { Range: rangeHeader } : {},
    };

    const b2Res = await fetch(presignedUrl);
    if (!b2Res.ok) {
      const err = await b2Res.text();
      return new Response(err || "Presigned URL failed", { status: b2Res.status });
    }

    const { url: b2Url } = (await b2Res.json()) as { url: string };
    const objectRes = await fetch(b2Url, fetchOpts);

    if (!objectRes.ok) {
      return new Response("B2 fetch failed", { status: objectRes.status });
    }

    const headers = new Headers(objectRes.headers);
    if (objectKey.startsWith("content/")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      headers.set("Cache-Control", "public, max-age=3600");
    }
    cors.forEach((v, k) => headers.set(k, v));

    // Clone for cache; return original (body can only be consumed once)
    const [toReturn, toCache] = [objectRes, objectRes.clone()];
    const cacheHeaders = new Headers(toCache.headers);
    if (objectKey.startsWith("content/")) {
      cacheHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      cacheHeaders.set("Cache-Control", "public, max-age=3600");
    }
    cors.forEach((v, k) => cacheHeaders.set(k, v));

    ctx.waitUntil(
      cache.put(
        cacheRequest,
        new Response(toCache.body, {
          status: toCache.status,
          statusText: toCache.statusText,
          headers: cacheHeaders,
        })
      )
    );

    return new Response(toReturn.body, {
      status: toReturn.status,
      statusText: toReturn.statusText,
      headers,
    });
  },
};
