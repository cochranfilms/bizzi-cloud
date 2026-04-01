/**
 * Cron: Expired trash → pending_permanent_delete + deletion_jobs enqueue.
 * Physical purge runs in /api/cron/deletion-jobs-worker (shared engine).
 *
 * Schedule: daily (e.g. 4am). Requires CRON_SECRET.
 * Reads admin_settings.platform: permanentDeleteAfterDays ?? trashRetentionDays.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";
import {
  BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
  BACKUP_LIFECYCLE_TRASHED,
} from "@/lib/backup-file-lifecycle";
import { enqueueBackupFilesPurgeJob } from "@/lib/deletion-jobs";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;
const UPDATE_BATCH = 450;

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

  const settingsSnap = await db.collection("admin_settings").doc("platform").get();
  const stored = settingsSnap.exists ? settingsSnap.data() : null;
  const trashRetentionDays = (stored?.trashRetentionDays as number) ?? 30;
  const permanentDeleteDays =
    (stored?.permanentDeleteAfterDays as number) ?? trashRetentionDays;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - permanentDeleteDays);

  const snap = await db
    .collection("backup_files")
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED)
    .where("deleted_at", "<", Timestamp.fromDate(cutoff))
    .limit(BATCH_SIZE)
    .get();

  const eligible = snap.docs;

  if (eligible.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      jobs: 0,
      retentionDays: permanentDeleteDays,
    });
  }

  const ids = eligible.map((d) => d.id);

  for (let i = 0; i < ids.length; i += UPDATE_BATCH) {
    const batch = db.batch();
    for (const id of ids.slice(i, i + UPDATE_BATCH)) {
      batch.update(db.collection("backup_files").doc(id), {
        lifecycle_state: BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
      });
    }
    await batch.commit();
  }

  const jobId = await enqueueBackupFilesPurgeJob(db, {
    requestedBy: "system:cron-trash-cleanup",
    fileIds: ids,
    driveId: null,
  });

  return NextResponse.json({
    enqueued: ids.length,
    jobs: 1,
    job_id: jobId,
    retentionDays: permanentDeleteDays,
  });
}

export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
