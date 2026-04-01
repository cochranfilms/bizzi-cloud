/**
 * Dedicated Linux media worker: claim next pending .braw proxy job.
 * POST with Authorization: Bearer MEDIA_BRAW_WORKER_SECRET
 *
 * Worker flow: claim → download sourceDownloadUrl → transcode to H.264 MP4 → PUT proxyUploadUrl
 * (send Content-Type: video/mp4 and x-amz-server-side-encryption: AES256) → POST .../complete.
 */
import { NextResponse } from "next/server";
import {
  BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE,
  verifyMediaBrawWorkerRequest,
} from "@/lib/braw-media-worker";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import {
  createPresignedDownloadUrl,
  createPresignedUploadUrl,
  getProxyObjectKey,
} from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { proxyJobRowIsBrawQueue } from "@/lib/proxy-queue";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.MEDIA_BRAW_WORKER_SECRET?.trim()) {
    return NextResponse.json(
      { error: "MEDIA_BRAW_WORKER_SECRET is not configured", detail: BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE },
      { status: 503 }
    );
  }
  if (!verifyMediaBrawWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection("proxy_jobs")
    .where("status", "==", "pending")
    .where("media_worker", "==", "braw")
    .orderBy("created_at")
    .limit(1)
    .get();

  let doc = snap.empty ? undefined : snap.docs[0];
  if (!doc) {
    const legacy = await db
      .collection("proxy_jobs")
      .where("status", "==", "pending")
      .orderBy("created_at")
      .limit(40)
      .get();
    doc = legacy.docs.find((d) => {
      const data = d.data();
      return proxyJobRowIsBrawQueue(
        data as Record<string, unknown>,
        data.object_key as string,
        (data.name as string | null) ?? null
      );
    });
  }

  if (!doc) {
    return NextResponse.json({ job: null });
  }

  const ref = doc.ref;
  const now = new Date().toISOString();
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      const data = fresh.data();
      if (!data || data.status !== "pending") throw new Error("no_longer_pending");
      tx.update(ref, { status: "processing", updated_at: now, claimed_at: now });
    });
  } catch {
    return NextResponse.json({ job: null });
  }

  const data = doc.data();
  let objectKey = data.object_key as string;
  const backupFileId = (data.backup_file_id as string | null) ?? null;
  if (backupFileId) {
    const bf = await db.collection("backup_files").doc(backupFileId).get();
    const k = bf.data()?.object_key as string | undefined;
    if (typeof k === "string" && k.trim()) objectKey = k;
  }

  const userId = data.user_id as string;
  const hasAccess = await verifyBackupFileAccess(userId, objectKey);
  if (!hasAccess) {
    await ref.update({ status: "completed", updated_at: now, error: "access_revoked" });
    return NextResponse.json({ job: null });
  }

  const proxyKey = getProxyObjectKey(objectKey);
  const sourceDownloadUrl = await createPresignedDownloadUrl(objectKey, 900);
  const proxyUploadUrl = await createPresignedUploadUrl(proxyKey, "video/mp4", 3600);

  return NextResponse.json({
    job: {
      id: doc.id,
      object_key: objectKey,
      backup_file_id: backupFileId,
      user_id: userId,
      name: (data.name as string | null) ?? null,
      proxy_object_key: proxyKey,
    },
    sourceDownloadUrl,
    proxyUploadUrl,
    proxyUploadHeaders: {
      "Content-Type": "video/mp4",
      "x-amz-server-side-encryption": "AES256",
    },
  });
}
