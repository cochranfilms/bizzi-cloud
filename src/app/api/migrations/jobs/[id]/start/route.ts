import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIGRATION_JOBS_COLLECTION } from "@/lib/migration-constants";
import { migrationRequireUid } from "@/lib/migration-require-auth";
import { migrationDestinationStillValid } from "@/lib/migration-destination";
import type { MigrationDestinationContract } from "@/lib/migration-destination";
import { userCanWriteWorkspace } from "@/lib/workspace-access";
import { getUploadBillingSnapshot } from "@/lib/enterprise-storage";
import { logMigrationTransferStarted } from "@/lib/migration-log-activity";

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
  if (!doc.exists) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = doc.data()!;
  if (row.user_id !== auth.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.status !== "ready") {
    return NextResponse.json(
      { error: `Job is not ready (status=${row.status})`, code: "not_ready" },
      { status: 400 }
    );
  }

  const contract = row.destination_contract as MigrationDestinationContract;
  const destOk = await migrationDestinationStillValid(db, contract);
  if (!destOk.ok) {
    await ref.update({
      status: "blocked_destination_invalid",
      failure_code: destOk.code,
      failure_message: destOk.message,
      updated_at: FieldValue.serverTimestamp(),
    });
    return NextResponse.json(
      { error: destOk.message, code: destOk.code },
      { status: 400 }
    );
  }

  try {
    if (contract.workspace_id) {
      const ok = await userCanWriteWorkspace(auth.uid, contract.workspace_id);
      if (!ok) throw new Error("no_write");
    } else {
      await getUploadBillingSnapshot(auth.uid, contract.linked_drive_id);
    }
  } catch {
    return NextResponse.json(
      { error: "No access to destination", code: "permission_revoked" },
      { status: 403 }
    );
  }

  await ref.update({
    status: "running",
    started_transfer_at: new Date().toISOString(),
    updated_at: FieldValue.serverTimestamp(),
  });
  logMigrationTransferStarted(auth.uid, contract, id);
  return NextResponse.json({ ok: true });
}
