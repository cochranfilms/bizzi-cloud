/**
 * POST /api/proxy/process-one
 * Process a single proxy job immediately by object_key.
 * Called fire-and-forget after upload/extract-metadata to avoid waiting for cron.
 * Requires CRON_SECRET. If job not found or already done, returns ok.
 */
import { NextResponse } from "next/server";
import { getProxyObjectKey } from "@/lib/b2";
import { isTerminalProxySourceInputError } from "@/lib/proxy-input-errors";
import { runProxyGeneration } from "@/lib/proxy-generation";
import {
  getProxyJobByObjectKey,
  updateProxyJobStatus,
  incrementProxyJobRetry,
} from "@/lib/proxy-queue";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { getAdminFirestore } from "@/lib/firebase-admin";

const CRON_SECRET = process.env.CRON_SECRET;

export const maxDuration = 300;

async function updateBackupFileProxyStatus(
  backupFileId: string | null,
  updates: Record<string, unknown>
): Promise<void> {
  if (!backupFileId) return;
  const db = getAdminFirestore();
  await db.collection("backup_files").doc(backupFileId).update(updates);
}

export async function POST(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: { object_key: string };
  try {
    body = (await request.json()) as { object_key: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { object_key } = body;
  if (!object_key || typeof object_key !== "string") {
    return NextResponse.json({ error: "object_key required" }, { status: 400 });
  }

  const job = await getProxyJobByObjectKey(object_key);
  if (!job) {
    return NextResponse.json({ ok: true, processed: false, reason: "no_pending_job" });
  }

  let accessObjectKey = job.object_key;
  if (job.backup_file_id) {
    const bf = await getAdminFirestore().collection("backup_files").doc(job.backup_file_id).get();
    const k = bf.data()?.object_key as string | undefined;
    if (typeof k === "string" && k.trim()) accessObjectKey = k;
  }

  const hasAccess = await verifyBackupFileAccess(job.user_id, accessObjectKey);
  if (!hasAccess) {
    await updateProxyJobStatus(job.id, "completed");
    return NextResponse.json({ ok: true, processed: true, reason: "skipped_no_access" });
  }

  const result = await runProxyGeneration({
    objectKey: job.object_key,
    fileName: job.name,
    backupFileId: job.backup_file_id,
  });

  const now = new Date().toISOString();
  const effectiveSourceKey = result.resolvedSourceObjectKey ?? job.object_key;
  const proxyKey = getProxyObjectKey(effectiveSourceKey);

  if (result.ok) {
    await updateProxyJobStatus(job.id, "completed");
    if (result.alreadyExists) {
      await updateBackupFileProxyStatus(job.backup_file_id, {
        proxy_status: "ready",
        proxy_object_key: proxyKey,
        proxy_generated_at: now,
      });
    } else {
      await updateBackupFileProxyStatus(job.backup_file_id, {
        proxy_status: "ready",
        proxy_object_key: proxyKey,
        proxy_size_bytes: result.proxySizeBytes ?? null,
        proxy_duration_sec: result.proxyDurationSec ?? null,
        proxy_generated_at: now,
        proxy_error_reason: null,
      });
    }
    return NextResponse.json({ ok: true, processed: true, completed: true });
  } else if (result.rawUnsupported) {
    await updateProxyJobStatus(job.id, "completed");
    await updateBackupFileProxyStatus(job.backup_file_id, {
      proxy_status: "raw_unsupported",
      proxy_error_reason: "RAW format requires dedicated transcode pipeline",
      proxy_generated_at: now,
    });
    return NextResponse.json({ ok: true, processed: true, completed: true });
  } else if (isTerminalProxySourceInputError(result.proxyErrorCode)) {
    await updateProxyJobStatus(job.id, "completed");
    await updateBackupFileProxyStatus(job.backup_file_id, {
      proxy_status: "failed",
      proxy_error_reason: result.error ?? result.proxyErrorCode ?? "source input error",
      proxy_generated_at: now,
    });
    return NextResponse.json({
      ok: true,
      processed: true,
      completed: true,
      terminalSourceError: result.proxyErrorCode,
    });
  } else {
    const errMsg = result.error ?? "Unknown error";
    await incrementProxyJobRetry(job.id, errMsg);
    await updateBackupFileProxyStatus(job.backup_file_id, {
      proxy_status: "failed",
      proxy_error_reason: errMsg,
      proxy_generated_at: now,
    });
    return NextResponse.json({ ok: true, processed: true, completed: false, error: errMsg });
  }
}
