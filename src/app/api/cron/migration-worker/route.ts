/**
 * Processes cloud migration scan + transfer. Schedule every 1–2 minutes.
 * Large single-file transfers need as much wall time as the host allows (still far below multi‑GB videos).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";

/** Vercel Pro: up to 300s; required for multi‑minute streams. Hobby is often lower — use a long‑running worker for huge files. */
export const maxDuration = 300;
import { runMigrationWorkerOnce } from "@/lib/migration-worker";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const MAX_PASSES = 8;

/** Vercel Cron invokes scheduled routes with GET; manual runs may use POST. */
async function handleCron(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  let passes = 0;
  let claimed = 0;
  for (let i = 0; i < MAX_PASSES; i++) {
    const r = await runMigrationWorkerOnce(db);
    passes++;
    if (r.claimed) claimed++;
    if (!r.claimed) break;
  }
  return NextResponse.json({ ok: true, passes, claimed_jobs: claimed });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
