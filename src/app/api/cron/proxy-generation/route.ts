/**
 * Cron: Process proxy generation queue.
 * Picks pending jobs and runs FFmpeg to create 720p H.264 proxies.
 * Schedule: every 5 min. Requires CRON_SECRET.
 *
 * Proxy jobs are enqueued by upload-complete, extract-metadata, BackupContext.
 */
import { NextResponse } from "next/server";
import { runProxyGeneration } from "@/lib/proxy-generation";
import {
  getPendingProxyJobs,
  updateProxyJobStatus,
  incrementProxyJobRetry,
} from "@/lib/proxy-queue";
import { verifyBackupFileAccess } from "@/lib/backup-access";

const CRON_SECRET = process.env.CRON_SECRET;
const BATCH_SIZE = 2; // Process up to 2 per run to stay within serverless timeout

export const maxDuration = 300;

export async function POST(request: Request) {
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

    if (result.ok) {
      await updateProxyJobStatus(job.id, "completed");
      completed++;
    } else if (result.alreadyExists) {
      await updateProxyJobStatus(job.id, "completed");
      completed++;
    } else {
      await incrementProxyJobRetry(job.id, result.error ?? "Unknown error");
      failed++;
    }
  }

  return NextResponse.json({
    processed,
    completed,
    failed,
  });
}
