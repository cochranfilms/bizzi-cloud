/**
 * POST /api/backup/permanent-delete
 * Permanently deletes files (and optionally a drive) from Firestore AND B2.
 * Body: { file_ids?: string[], drive_id?: string }
 *
 * For each file: deletes B2 object (content + proxy + thumbnail cache) if no other
 * backup_file references it, then deletes Firestore doc.
 * For drive_id: deletes all files in the drive, then the drive doc.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  isB2Configured,
  deleteObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
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

  // Resolve file IDs: from file_ids + all files in drive if drive_id provided
  const idsToDelete = new Set<string>(fileIds);
  if (driveId) {
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!driveSnap.exists) {
      return NextResponse.json({ error: "Drive not found" }, { status: 404 });
    }
    if (driveSnap.data()?.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("linked_drive_id", "==", driveId)
      .get();
    filesSnap.docs.forEach((d) => idsToDelete.add(d.id));
  }

  const filesToDelete: Array<{ id: string; object_key: string }> = [];
  for (const id of idsToDelete) {
    const snap = await db.collection("backup_files").doc(id).get();
    if (!snap.exists) continue;
    const data = snap.data();
    if (data?.userId !== uid) continue;
    const objectKey = (data?.object_key as string) ?? "";
    if (objectKey) filesToDelete.push({ id, object_key: objectKey });
  }

  let b2Deleted = 0;
  let b2Skipped = 0;

  if (isB2Configured()) {
    for (const { id, object_key } of filesToDelete) {
      // Only delete from B2 if no OTHER backup_file references this object_key
      const refsSnap = await db
        .collection("backup_files")
        .where("object_key", "==", object_key)
        .get();
      const otherRefs = refsSnap.docs.filter((d) => d.id !== id);
      if (otherRefs.length > 0) {
        b2Skipped++;
        // Still delete Firestore doc - other files retain the object
        continue;
      }

      try {
        await deleteObject(object_key);
        b2Deleted++;
        const proxyKey = getProxyObjectKey(object_key);
        const thumbKey = getVideoThumbnailCacheKey(object_key);
        await Promise.all([
          deleteObject(proxyKey).catch(() => {}),
          deleteObject(thumbKey).catch(() => {}),
        ]);
      } catch (err) {
        console.error("[permanent-delete] B2 delete failed:", object_key, err);
        // Continue - delete Firestore doc anyway to avoid orphan DB records
      }
    }
  }

  // Delete Firestore docs
  const BATCH_SIZE = 500;
  const allIds = Array.from(idsToDelete);
  for (let i = 0; i < allIds.length; i += BATCH_SIZE) {
    const chunk = allIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection("backup_files").doc(id));
    }
    await batch.commit();
  }

  if (driveId) {
    await db.collection("linked_drives").doc(driveId).delete();
  }

  return NextResponse.json({
    ok: true,
    filesDeleted: allIds.length,
    driveDeleted: driveId ? 1 : 0,
    b2Deleted,
    b2Skipped,
  });
}
