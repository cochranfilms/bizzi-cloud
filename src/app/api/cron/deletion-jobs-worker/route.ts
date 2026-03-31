/**
 * Processes deletion_jobs chunks (B2 + Firestore purge). Schedule: frequent short runs.
 * Requires CRON_SECRET when set (same as other crons).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { runDeletionJobsWorkerLoop } from "@/lib/deletion-jobs";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
/** Bound work per HTTP invocation (each inner pass purges up to CHUNK files). */
const MAX_PASSES = 60;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const { totalPurged, passes, muxOutcomes } = await runDeletionJobsWorkerLoop(db, MAX_PASSES);

  return NextResponse.json({
    ok: true,
    filesPurged: totalPurged,
    passes,
    muxOutcomes,
  });
}
