/**
 * POST /api/backup/generate-proxy
 * Generates 720p H.264 proxy for video files.
 * With queue: true — enqueues to background job (recommended for upload flows).
 * Without queue — runs synchronously (for manual/backfill triggers).
 */
import {
  getProxyObjectKey,
  isB2Configured,
  objectExists,
} from "@/lib/b2";
import { verifyBackupFileAccessWithLifecycle } from "@/lib/backup-access";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { runProxyGeneration } from "@/lib/proxy-generation";
import { queueProxyJob } from "@/lib/proxy-queue";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    object_key: objectKey,
    name: fileName,
    user_id: userIdFromBody,
    backup_file_id: backupFileId,
    queue: queueParam,
  } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key required" }, { status: 400 });
  }

  const accessResult = await verifyBackupFileAccessWithLifecycle(uid, objectKey);
  if (!accessResult.allowed) {
    return NextResponse.json(
      { error: accessResult.message ?? "Access denied" },
      { status: accessResult.status ?? 403 }
    );
  }

  const proxyKey = getProxyObjectKey(objectKey);
  if (await objectExists(proxyKey)) {
    return NextResponse.json({ ok: true, alreadyExists: true });
  }

  // Queue mode: enqueue and return immediately (used by upload flows)
  if (queueParam === true) {
    await queueProxyJob({
      object_key: objectKey,
      name: typeof fileName === "string" ? fileName : undefined,
      backup_file_id: typeof backupFileId === "string" ? backupFileId : undefined,
      user_id: uid,
    });
    return NextResponse.json({ ok: true, queued: true });
  }

  // Synchronous mode: run now (for manual triggers, backfill)
  const result = await runProxyGeneration({
    objectKey,
    fileName: typeof fileName === "string" ? fileName : null,
    backupFileId: typeof backupFileId === "string" ? backupFileId : null,
  });

  const now = new Date().toISOString();
  const bfId = typeof backupFileId === "string" ? backupFileId : null;

  if (result.ok && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "ready",
      proxy_object_key: proxyKey,
      proxy_size_bytes: result.proxySizeBytes ?? null,
      proxy_duration_sec: result.proxyDurationSec ?? null,
      proxy_generated_at: now,
      proxy_error_reason: null,
    });
    return NextResponse.json({ ok: true, alreadyExists: result.alreadyExists });
  }
  if (result.rawUnsupported && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "raw_unsupported",
      proxy_error_reason: "RAW format requires dedicated transcode pipeline",
      proxy_generated_at: now,
    });
    return NextResponse.json(
      { error: result.error ?? "RAW format not supported for proxy" },
      { status: 400 }
    );
  }
  if (!result.ok && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "failed",
      proxy_error_reason: result.error ?? "Unknown error",
      proxy_generated_at: now,
    });
  }
  if (result.ok) return NextResponse.json({ ok: true, alreadyExists: result.alreadyExists });
  return NextResponse.json(
    { error: result.error ?? "Proxy generation failed" },
    { status: 500 }
  );
}
