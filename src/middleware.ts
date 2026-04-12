import { NextResponse, type NextRequest } from "next/server";

/**
 * Allow dashboard (app origin) to call upload control-plane on another subdomain
 * (e.g. upload.bizzicloud.io) with Bearer auth — browser requires CORS.
 */
function isAllowedUploadApiCorsOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    return u.hostname === "bizzicloud.io" || u.hostname.endsWith(".bizzicloud.io");
  } catch {
    return false;
  }
}

function applyUploadApiCors(request: NextRequest, response: NextResponse): void {
  const origin = request.headers.get("origin");
  if (!origin || !isAllowedUploadApiCorsOrigin(origin)) return;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, X-Requested-With"
  );
  response.headers.set("Vary", "Origin");
}

/**
 * LAYER 1: Transport Security
 * - Enforce HTTPS in production (Vercel handles this; this is defense in depth)
 * - Reject insecure callback/asset URLs when detectable
 */
export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isUploadControlApi =
    path.startsWith("/api/uploads") || path.startsWith("/api/uppy");

  if (isUploadControlApi && request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    applyUploadApiCors(request, preflight);
    return preflight;
  }

  // Vercel already redirects HTTP→HTTPS; this guards against X-Forwarded-Proto spoof in edge cases
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto");
    if (proto === "http") {
      const url = request.nextUrl.clone();
      url.protocol = "https:";
      return NextResponse.redirect(url, 301);
    }
  }

  const res = NextResponse.next();
  if (isUploadControlApi) {
    applyUploadApiCors(request, res);
  }
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/workspace/:path*", "/api/:path*"],
};
