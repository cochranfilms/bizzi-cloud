/**
 * POST /api/backup/permanent-delete
 * Marks authorized backup_files as pending_permanent_delete, sets deletion_jobs row, returns immediately.
 * Physical B2 + Firestore removal runs in /api/cron/deletion-jobs-worker.
 * Body: { file_ids?: string[], drive_id?: string }
 */
import type { DocumentData } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { logActivityEvent } from "@/lib/activity-log";
import { assertMayRemoveBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE } from "@/lib/backup-file-lifecycle";
import { enqueueBackupFilesPurgeJob } from "@/lib/deletion-jobs";
import { NextResponse } from "next/server";

const UPDATE_BATCH = 500;

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

  const authorizedIds: string[] = [];
  const authorizedFileData: DocumentData[] = [];
  for (const id of idsToDelete) {
    try {
      await assertMayRemoveBackupFile(uid, id);
    } catch (err) {
      if (err instanceof TrashForbiddenError) {
        continue;
      }
      throw err;
    }
    const snap = await db.collection("backup_files").doc(id).get();
    if (!snap.exists) continue;
    const fileData = snap.data()!;
    const ls = fileData.lifecycle_state as string | undefined;
    if (ls === "pending_permanent_delete" || ls === "permanently_deleted") {
      continue;
    }
    authorizedIds.push(id);
    authorizedFileData.push(fileData);
  }

  if (authorizedIds.length === 0) {
    if (driveId) {
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
    return NextResponse.json({ error: "No files to delete" }, { status: 400 });
  }

  for (let i = 0; i < authorizedIds.length; i += UPDATE_BATCH) {
    const batch = db.batch();
    const end = Math.min(i + UPDATE_BATCH, authorizedIds.length);
    for (let j = i; j < end; j++) {
      const id = authorizedIds[j];
      const fileData = authorizedFileData[j];
      const patch: Record<string, unknown> = {
        lifecycle_state: BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
      };
      if (!fileData.deleted_at) {
        patch.deleted_at = FieldValue.serverTimestamp();
      }
      batch.update(db.collection("backup_files").doc(id), patch);
    }
    await batch.commit();
  }

  const jobId = await enqueueBackupFilesPurgeJob(db, {
    requestedBy: uid,
    fileIds: authorizedIds,
    driveId: driveId ?? null,
  });

  logActivityEvent({
    event_type: "file_deleted",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: driveId ?? null,
    metadata: {
      deleted_count: authorizedIds.length,
      drive_will_delete: !!driveId,
      deletion_job_id: jobId,
      purge_async: true,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    job_id: jobId,
    filesDeleted: authorizedIds.length,
    filesEnqueued: authorizedIds.length,
    driveDeleted: 0,
    drivePurgePending: !!driveId,
    b2Deleted: 0,
    b2Skipped: 0,
  });
}
