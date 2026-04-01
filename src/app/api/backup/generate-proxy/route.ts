/**
 * POST /api/backup/generate-proxy
 * Production: enqueues a durable proxy_jobs row and returns immediately (no FFmpeg).
 * Non-production: optional sync transcode when ALLOW_SYNC_PROXY_GENERATION=true.
 */
import { getProxyObjectKey, isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccessWithLifecycle } from "@/lib/backup-access";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { isBrawFile } from "@/lib/format-detection";
import { runProxyGeneration } from "@/lib/proxy-generation";
import { isTerminalProxySourceInputError } from "@/lib/proxy-input-errors";
import { queueProxyJob } from "@/lib/proxy-queue";
import { validateStandardProxyPlayability } from "@/lib/proxy-playability";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const allowSyncProxy =
  process.env.ALLOW_SYNC_PROXY_GENERATION === "true" &&
  process.env.NODE_ENV !== "production";

export const maxDuration = 60;

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

  const bfId = typeof backupFileId === "string" ? backupFileId : null;
  const resolvedPreviewKey =
    bfId != null
      ? ((
          await getAdminFirestore().collection("backup_files").doc(bfId).get()
        ).data()?.object_key as string | undefined) ?? objectKey
      : objectKey;

  const accessResult = await verifyBackupFileAccessWithLifecycle(uid, resolvedPreviewKey);
  if (!accessResult.allowed) {
    return NextResponse.json(
      { error: accessResult.message ?? "Access denied" },
      { status: accessResult.status ?? 403 }
    );
  }

  const leaf = resolvedPreviewKey.split("/").filter(Boolean).pop() ?? resolvedPreviewKey;
  if (isBrawFile(leaf) && queueParam !== true && !allowSyncProxy) {
    return NextResponse.json(
      {
        error:
          "Blackmagic RAW (.braw) must be queued. Use queue: true and the dedicated Linux worker (POST /api/workers/braw-proxy/claim with worker_id).",
      },
      { status: 501 }
    );
  }

  const proxyKey = getProxyObjectKey(resolvedPreviewKey);
  const playability = await validateStandardProxyPlayability(proxyKey, {
    skipFirstFrameDecode: false,
  });
  if (playability.ok) {
    if (bfId) {
      const db = getAdminFirestore();
      await db
        .collection("backup_files")
        .doc(bfId)
        .update({
          proxy_status: "ready",
          proxy_object_key: proxyKey,
          proxy_size_bytes: playability.sizeBytes,
          proxy_duration_sec: playability.durationSec,
          proxy_generated_at: new Date().toISOString(),
          proxy_error_reason: null,
        })
        .catch(() => {});
    }
    return NextResponse.json({
      ok: true,
      alreadyExists: true,
      validated: true,
    });
  }

  const wantSync = queueParam === false && allowSyncProxy;
  const shouldEnqueue = process.env.NODE_ENV === "production" || !wantSync;
  if (shouldEnqueue) {
    await queueProxyJob({
      object_key: objectKey,
      name: typeof fileName === "string" ? fileName : undefined,
      backup_file_id: bfId ?? undefined,
      user_id: uid,
    });
    return NextResponse.json({
      ok: true,
      queued: true,
      job_id: bfId ?? null,
    });
  }

  const result = await runProxyGeneration({
    objectKey,
    fileName: typeof fileName === "string" ? fileName : null,
    backupFileId: bfId,
  });

  const now = new Date().toISOString();
  const effectiveProxyKey = getProxyObjectKey(result.resolvedSourceObjectKey ?? objectKey);

  if (result.ok && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "ready",
      proxy_object_key: effectiveProxyKey,
      proxy_size_bytes: result.proxySizeBytes ?? null,
      proxy_duration_sec: result.proxyDurationSec ?? null,
      proxy_generated_at: now,
      proxy_error_reason: null,
    });
    return NextResponse.json({ ok: true, alreadyExists: result.alreadyExists });
  }
  if (result.brawRequiresDedicatedWorker && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "failed",
      proxy_error_reason:
        result.error ?? "raw_decoder_unavailable: use dedicated BRAW worker",
      proxy_generated_at: now,
    });
    return NextResponse.json(
      { error: result.error ?? "Use dedicated BRAW worker", brawWorker: true },
      { status: 501 }
    );
  }
  if (result.rawUnsupported && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "raw_unsupported",
      proxy_error_reason:
        result.error?.trim() || "RAW format requires dedicated transcode pipeline",
      proxy_generated_at: now,
    });
    return NextResponse.json(
      { error: result.error ?? "RAW format not supported for proxy" },
      { status: 400 }
    );
  }
  if (isTerminalProxySourceInputError(result.proxyErrorCode) && bfId) {
    const db = getAdminFirestore();
    await db.collection("backup_files").doc(bfId).update({
      proxy_status: "failed",
      proxy_error_reason: result.error ?? result.proxyErrorCode ?? "source input error",
      proxy_generated_at: now,
    });
    return NextResponse.json(
      {
        error: result.error ?? "Source file missing or URL not readable",
        proxyErrorCode: result.proxyErrorCode,
      },
      { status: 404 }
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
