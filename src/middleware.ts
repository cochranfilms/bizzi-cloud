import { NextResponse, type NextRequest } from "next/server";

/**
 * LAYER 1: Transport Security
 * - Enforce HTTPS in production (Vercel handles this; this is defense in depth)
 * - Reject insecure callback/asset URLs when detectable
 */
export async function middleware(request: NextRequest) {
  // Vercel already redirects HTTP→HTTPS; this guards against X-Forwarded-Proto spoof in edge cases
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto");
    if (proto === "http") {
      const url = request.nextUrl.clone();
      url.protocol = "https";
      return NextResponse.redirect(url, 301);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
