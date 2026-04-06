/**
 * POST /api/backup/permanent-delete
 * Marks authorized backup_files as pending_permanent_delete, sets deletion_jobs row, returns immediately.
 * Physical B2 + Firestore removal runs in /api/cron/deletion-jobs-worker.
 * Body: { file_ids?: string[], drive_id?: string }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { logActivityEvent } from "@/lib/activity-log";
import { assertMayRemoveBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { enqueuePermanentDeleteJobForBackupFileIds } from "@/lib/backup-files-trash-domain";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { file_ids?: string[]; drive_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fileIds = body.file_ids ?? [];
  const driveId = body.drive_id ?? null;

  if (fileIds.length === 0 && !driveId) {
    return NextResponse.json({ error: "file_ids or drive_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();

  const idsToDelete = new Set<string>(fileIds);
  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!driveSnap.exists) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (driveSnap.data()?.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const driveOrgId = driveSnap.data()?.organization_id as string | null | undefined;
    const filesSnap = driveOrgId
      ? await db
          .collection("backup_files")
          .where("linked_drive_id", "==", driveId)
          .where("organization_id", "==", driveOrgId)
          .get()
      : await db.collection("backup_files").where("linked_drive_id", "==", driveId).get();
    for (const d of filesSnap.docs) {
      try {
        await assertMayRemoveBackupFile(uid, d.id);
        idsToDelete.add(d.id);
      } catch (err) {
        if (err instanceof TrashForbiddenError) {
          continue;
        }
        throw err;
      }
    }
  }

  const enqueueResult = await enqueuePermanentDeleteJobForBackupFileIds(db, uid, [...idsToDelete], {
    linkedDriveId: driveId,
  });

  if (!enqueueResult.ok) {
    if (
      driveId &&
      enqueueResult.err.status === 400 &&
      enqueueResult.err.error === "No files to delete"
    ) {
      await db.collection("linked_drives").doc(driveId).delete();
      logActivityEvent({
        event_type: "file_deleted",
        actor_user_id: uid,
        scope_type: "personal_account",
        linked_drive_id: driveId,
        metadata: { deleted_count: 0, drive_deleted: true, purge_async: false },
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        job_id: null,
        filesDeleted: 0,
        filesEnqueued: 0,
        driveDeleted: 1,
        drivePurgePending: false,
        b2Deleted: 0,
        b2Skipped: 0,
      });
    }
    return NextResponse.json({ error: enqueueResult.err.error }, { status: enqueueResult.err.status });
  }

  const authorizedIdsCount = enqueueResult.enqueuedCount;

  logActivityEvent({
    event_type: "file_deleted",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: driveId ?? null,
    metadata: {
      deleted_count: authorizedIdsCount,
      drive_will_delete: !!driveId,
      deletion_job_id: enqueueResult.jobId,
      purge_async: true,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    job_id: enqueueResult.jobId,
    filesDeleted: authorizedIdsCount,
    filesEnqueued: authorizedIdsCount,
    driveDeleted: 0,
    drivePurgePending: !!driveId,
    b2Deleted: 0,
    b2Skipped: 0,
  });
}
