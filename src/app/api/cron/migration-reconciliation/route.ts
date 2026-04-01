/**
 * Reconciliation for migration: expired upload reservations + stuck in_progress file rows.
 * Schedule less frequently than migration-worker (e.g. every 15–30 minutes).
 */
import { NextResponse } from "next/server";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { runMigrationReconciliation } from "@/lib/migration-reconciliation";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const db = getAdminFirestore();
  const stats = await runMigrationReconciliation(db);

  if (stats.reservations_released > 0 || stats.migration_files_reset > 0) {
    console.info("[migration-reconciliation]", stats);
  }

  return NextResponse.json({ ok: true, ...stats });
}
