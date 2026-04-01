import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_JOBS_COLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import type { MigrationDestinationContract } from "@/lib/migration-destination";
import { logMigrationJobPaused } from "@/lib/migration-log-activity";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await migrationRequireUid(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const db = getAdminFirestore();
  const ref = db.collection(MIGRATION_JOBS_COLLECTION).doc(id);
  const doc = await ref.get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = doc.data()!;
  if (row.user_id !== auth.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const prev = String(row.status ?? "");
  const contract = row.destination_contract as MigrationDestinationContract;

  await ref.update({
    pause_requested: true,
    paused_from_status: row.status,
    status: "paused",
    updated_at: FieldValue.serverTimestamp(),
  });
  logMigrationJobPaused(auth.uid, contract, id, prev);
  return NextResponse.json({ ok: true });
}
