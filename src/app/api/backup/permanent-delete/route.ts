/**
 * POST /api/backup/permanent-delete
 * Permanently deletes files (and optionally a drive) from Firestore AND B2.
 * Body: { file_ids?: string[], drive_id?: string }
 *
 * For each file: deletes B2 object (content + proxy + thumbnail cache) if no other
 * backup_file references it, then deletes Firestore doc.
 * For drive_id: deletes all files the caller is allowed to remove in the drive, then the drive doc.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  isB2Configured,
  deleteObjectWithRetry,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { logActivityEvent } from "@/lib/activity-log";
import { assertMayRemoveBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
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

  const authorizedIds: string[] = [];
  const filesToDelete: Array<{ id: string; object_key: string }> = [];
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
    authorizedIds.push(id);
    const objectKey = (snap.data()?.object_key as string) ?? "";
    if (objectKey) filesToDelete.push({ id, object_key: objectKey });
  }

  let b2Deleted = 0;
  let b2Skipped = 0;

  if (isB2Configured()) {
    for (const { id, object_key } of filesToDelete) {
      const refsSnap = await db
        .collection("backup_files")
        .where("object_key", "==", object_key)
        .get();
      const otherRefs = refsSnap.docs.filter((d) => d.id !== id);
      if (otherRefs.length > 0) {
        b2Skipped++;
        continue;
      }

      try {
        await deleteObjectWithRetry(object_key);
        b2Deleted++;
        const proxyKey = getProxyObjectKey(object_key);
        const thumbKey = getVideoThumbnailCacheKey(object_key);
        await Promise.all([
          deleteObjectWithRetry(proxyKey).catch(() => {}),
          deleteObjectWithRetry(thumbKey).catch(() => {}),
        ]);
      } catch (err) {
        console.error("[permanent-delete] B2 delete failed after retries:", object_key, err);
      }
    }
  }

  const BATCH_SIZE = 500;
  for (let i = 0; i < authorizedIds.length; i += BATCH_SIZE) {
    const chunk = authorizedIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection("backup_files").doc(id));
    }
    await batch.commit();
  }

  if (driveId) {
    await db.collection("linked_drives").doc(driveId).delete();
  }

  logActivityEvent({
    event_type: "file_deleted",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: driveId ?? null,
    metadata: {
      deleted_count: authorizedIds.length,
      drive_deleted: !!driveId,
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    filesDeleted: authorizedIds.length,
    driveDeleted: driveId ? 1 : 0,
    b2Deleted,
    b2Skipped,
  });
}
