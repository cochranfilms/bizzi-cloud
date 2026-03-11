/**
 * Cron: Permanently delete files that have been in trash past the retention period.
 * Deletes from B2 (content + proxy + thumbnail) and Firestore.
 *
 * Schedule: daily (e.g. 4am). Requires CRON_SECRET.
 * Reads admin_settings.platform: permanentDeleteAfterDays ?? trashRetentionDays.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import {
  isB2Configured,
  deleteObject,
  getVideoThumbnailCacheKey,
  getProxyObjectKey,
} from "@/lib/b2";
import { NextResponse } from "next/server";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 100;

export async function POST(request: Request) {
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
    .where("deleted_at", "!=", null)
    .where("deleted_at", "<", cutoff)
    .limit(BATCH_SIZE)
    .get();

  let b2Deleted = 0;
  let b2Skipped = 0;
  let firestoreDeleted = 0;

  if (isB2Configured()) {
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const objectKey = (data?.object_key as string) ?? "";
      if (!objectKey) {
        await docSnap.ref.delete();
        firestoreDeleted++;
        continue;
      }

      const refsSnap = await db
        .collection("backup_files")
        .where("object_key", "==", objectKey)
        .get();
      const otherRefs = refsSnap.docs.filter((d) => d.id !== docSnap.id);
      if (otherRefs.length > 0) {
        b2Skipped++;
      } else {
        try {
          await deleteObject(objectKey);
          b2Deleted++;
          const proxyKey = getProxyObjectKey(objectKey);
          const thumbKey = getVideoThumbnailCacheKey(objectKey);
          await Promise.all([
            deleteObject(proxyKey).catch(() => {}),
            deleteObject(thumbKey).catch(() => {}),
          ]);
        } catch (err) {
          console.error("[trash-cleanup] B2 delete failed:", objectKey, err);
        }
      }

      await docSnap.ref.delete();
      firestoreDeleted++;
    }
  } else {
    for (const docSnap of snap.docs) {
      await docSnap.ref.delete();
      firestoreDeleted++;
    }
  }

  return NextResponse.json({
    deleted: firestoreDeleted,
    b2Deleted,
    b2Skipped,
    retentionDays: permanentDeleteDays,
  });
}
