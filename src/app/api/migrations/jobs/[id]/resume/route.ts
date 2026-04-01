import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_JOBS_COLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import type { MigrationDestinationContract } from "@/lib/migration-destination";
import { logMigrationJobResumed } from "@/lib/migration-log-activity";

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

  const restore = (row.paused_from_status as string | undefined) || "scanning";
  const contract = row.destination_contract as MigrationDestinationContract;

  await ref.update({
    pause_requested: false,
    status: restore,
    updated_at: FieldValue.serverTimestamp(),
  });
  logMigrationJobResumed(auth.uid, contract, id, restore);
  return NextResponse.json({ ok: true, status: restore });
}
