/**
 * Cron: normalize legacy proxy_jobs rows + reclaim expired leases.
 * Schedule: every 5 min. Requires CRON_SECRET.
 * Does not run FFmpeg — dedicated workers claim jobs via /api/workers/* /claim.
 */
import { NextResponse } from "next/server";
import {
  normalizeLegacyProxyJobStatuses,
  reclaimExpiredProxyJobLeases,
} from "@/lib/proxy-job-pipeline";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 120;

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const migrated = await normalizeLegacyProxyJobStatuses(200);
  const { reclaimed } = await reclaimExpiredProxyJobLeases(100);

  return NextResponse.json({
    ok: true,
    legacy_rows_normalized: migrated,
    leases_reclaimed: reclaimed,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
