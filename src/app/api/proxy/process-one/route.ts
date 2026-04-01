/**
 * POST /api/proxy/process-one — deprecated.
 * Proxy work is claimed by dedicated workers (/api/workers/standard-proxy/claim).
 * Kept for backward compatibility: returns ok without running FFmpeg.
 */
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 30;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    await request.json().catch(() => ({}));
  } catch {
    // ignore
  }

  return NextResponse.json({
    ok: true,
    deprecated: true,
    message:
      "Inline proxy processing removed. Run the standard-proxy worker against /api/workers/standard-proxy/claim.",
  });
}
