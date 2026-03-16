/**
 * Cron: Process proxy generation queue.
 * Picks pending jobs and runs FFmpeg to create 720p H.264 proxies.
 * Schedule: every 5 min. Requires CRON_SECRET.
 * Updates backup_files with proxy_status, proxy_object_key, etc.
 *
 * Proxy jobs are enqueued by upload-complete, extract-metadata, BackupContext.
 */
import { NextResponse } from "next/server";
import { getProxyObjectKey } from "@/lib/b2";
import { runProxyGeneration } from "@/lib/proxy-generation";
import {
  getPendingProxyJobs,
  updateProxyJobStatus,
  incrementProxyJobRetry,
} from "@/lib/proxy-queue";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { getAdminFirestore } from "@/lib/firebase-admin";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 6; // Process up to 6 per run; immediate trigger handles new uploads

export const maxDuration = 300;

async function updateBackupFileProxyStatus(
  backupFileId: string | null,
  updates: Record<string, unknown>
): Promise<void> {
  if (!backupFileId) return;
  const db = getAdminFirestore();
  await db.collection("backup_files").doc(backupFileId).update(updates);
}

async function handleCron(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (token !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const jobs = await getPendingProxyJobs(BATCH_SIZE);
  let processed = 0;
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    processed++;

    // Verify user still has access (file could have been deleted)
    const hasAccess = await verifyBackupFileAccess(job.user_id, job.object_key);
    if (!hasAccess) {
      await updateProxyJobStatus(job.id, "completed"); // Treat as completed (skip)
      completed++;
      continue;
    }

    const result = await runProxyGeneration({
      objectKey: job.object_key,
      fileName: job.name,
      backupFileId: job.backup_file_id,
    });

    const now = new Date().toISOString();
    const proxyKey = getProxyObjectKey(job.object_key);

    if (result.ok) {
      await updateProxyJobStatus(job.id, "completed");
      completed++;
      if (result.alreadyExists) {
        // Ensure backup_files has proxy_status=ready for existing proxies
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
    } else if (result.rawUnsupported) {
      await updateProxyJobStatus(job.id, "completed"); // Don't retry RAW
      await updateBackupFileProxyStatus(job.backup_file_id, {
        proxy_status: "raw_unsupported",
        proxy_error_reason: "RAW format requires dedicated transcode pipeline",
        proxy_generated_at: now,
      });
      completed++;
    } else {
      const errMsg = result.error ?? "Unknown error";
      await incrementProxyJobRetry(job.id, errMsg);
      failed++;
      await updateBackupFileProxyStatus(job.backup_file_id, {
        proxy_status: "failed",
        proxy_error_reason: errMsg,
        proxy_generated_at: now,
      });
    }
  }

  return NextResponse.json({
    processed,
    completed,
    failed,
  });
}

/** Vercel cron sends GET requests */
export async function GET(request: Request) {
  return handleCron(request);
}

export async function POST(request: Request) {
  return handleCron(request);
}
