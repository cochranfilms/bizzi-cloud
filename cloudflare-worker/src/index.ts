/**
 * Bizzi Cloud CDN Worker - proxies B2 downloads through Cloudflare for free B2 egress (Bandwidth Alliance).
 */

export interface Env {
  API_BASE_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const objectKey = decodeURIComponent(url.pathname.slice(1));
    const exp = url.searchParams.get("exp");
    const sig = url.searchParams.get("sig");
    const downloadFilename = url.searchParams.get("download") ?? undefined;

    if (!objectKey || !exp || !sig) {
      return new Response("Missing object_key, exp, or sig", { status: 400 });
    }

    const apiBase = env.API_BASE_URL?.replace(/\/$/, "") || "https://bizzicloud.io";
    const presignedUrl = `${apiBase}/api/cdn-presigned?object_key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${encodeURIComponent(sig)}${downloadFilename ? `&download=${encodeURIComponent(downloadFilename)}` : ""}`;

    const rangeHeader = request.headers.get("Range");
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
    }

    return new Response(objectRes.body, {
      status: objectRes.status,
      statusText: objectRes.statusText,
      headers,
    });
  },
};
