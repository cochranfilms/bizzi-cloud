/**
 * Dedicated Linux media worker: mark BRAW proxy job done after uploading MP4 to proxyUploadUrl from claim.
 * POST { job_id, ok: boolean, error?: string, proxy_size_bytes?: number, proxy_duration_sec?: number }
 */
import { NextResponse } from "next/server";
import { formatRawDecoderUnavailableMessage, verifyMediaBrawWorkerRequest } from "@/lib/braw-media-worker";
import { getObjectMetadata, getProxyObjectKey } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { MIN_PROXY_SIZE_BYTES } from "@/lib/format-detection";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.MEDIA_BRAW_WORKER_SECRET?.trim()) {
    return NextResponse.json({ error: "MEDIA_BRAW_WORKER_SECRET is not configured" }, { status: 503 });
  }
  if (!verifyMediaBrawWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    job_id?: string;
    ok?: boolean;
    error?: string;
    proxy_size_bytes?: number;
    proxy_duration_sec?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.job_id;
  if (!jobId || typeof jobId !== "string") {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }
  if (typeof body.ok !== "boolean") {
    return NextResponse.json({ error: "ok boolean is required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const jobRef = db.collection("proxy_jobs").doc(jobId);
  const jobSnap = await jobRef.get();
  if (!jobSnap.exists) {
    return NextResponse.json({ error: "job not found" }, { status: 404 });
  }

  const jobData = jobSnap.data()!;
  if (jobData.status !== "processing") {
    return NextResponse.json(
      { error: "job is not in processing state", status: jobData.status },
      { status: 409 }
    );
  }

  let objectKey = jobData.object_key as string;
  const backupFileId = (jobData.backup_file_id as string | null) ?? null;
  if (backupFileId) {
    const bf = await db.collection("backup_files").doc(backupFileId).get();
    const k = bf.data()?.object_key as string | undefined;
    if (typeof k === "string" && k.trim()) objectKey = k;
  }

  const proxyKey = getProxyObjectKey(objectKey);
  const now = new Date().toISOString();

  if (body.ok) {
    const meta = await getObjectMetadata(proxyKey);
    if (!meta || meta.contentLength < MIN_PROXY_SIZE_BYTES) {
      const errMsg = formatRawDecoderUnavailableMessage(
        "Proxy file missing or too small after upload — verify PUT succeeded with required SSE headers."
      );
      await jobRef.update({ status: "completed", updated_at: now, error: errMsg });
      if (backupFileId) {
        await db.collection("backup_files").doc(backupFileId).update({
          proxy_status: "failed",
          proxy_error_reason: errMsg,
          proxy_generated_at: now,
        });
      }
      return NextResponse.json({ error: "proxy validation failed", proxy_object_key: proxyKey }, { status: 400 });
    }

    await jobRef.update({ status: "completed", updated_at: now, error: null });
    if (backupFileId) {
      await db.collection("backup_files").doc(backupFileId).update({
        proxy_status: "ready",
        proxy_object_key: proxyKey,
        proxy_size_bytes: body.proxy_size_bytes ?? meta.contentLength,
        proxy_duration_sec: body.proxy_duration_sec ?? null,
        proxy_generated_at: now,
        proxy_error_reason: null,
      });
    }
    return NextResponse.json({ ok: true, proxy_object_key: proxyKey });
  }

  const errMsg = formatRawDecoderUnavailableMessage(body.error ?? "worker reported transcode failure");
  await jobRef.update({ status: "completed", updated_at: now, error: errMsg });
  if (backupFileId) {
    await db.collection("backup_files").doc(backupFileId).update({
      proxy_status: "failed",
      proxy_error_reason: errMsg,
      proxy_generated_at: now,
    });
  }
  return NextResponse.json({ ok: true, recorded: "failure" });
}
