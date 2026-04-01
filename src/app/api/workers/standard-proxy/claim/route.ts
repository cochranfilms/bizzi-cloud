/**
 * Standard FFmpeg proxy worker: claim next queued job (not BRAW).
 * POST JSON { worker_id: string } — Authorization: Bearer MEDIA_STANDARD_WORKER_SECRET
 */
import { NextResponse } from "next/server";
import { claimStandardProxyJob } from "@/lib/proxy-job-pipeline";
import {
  isStandardMediaWorkerConfigured,
  verifyMediaStandardWorkerRequest,
} from "@/lib/standard-media-worker";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isStandardMediaWorkerConfigured()) {
    return NextResponse.json(
      { error: "MEDIA_STANDARD_WORKER_SECRET is not configured" },
      { status: 503 }
    );
  }
  if (!verifyMediaStandardWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { worker_id?: string };
  try {
    body = (await request.json()) as { worker_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const workerId = typeof body.worker_id === "string" ? body.worker_id.trim() : "";
  if (!workerId) {
    return NextResponse.json({ error: "worker_id is required" }, { status: 400 });
  }

  const result = await claimStandardProxyJob(workerId);
  if (!result) {
    return NextResponse.json({ job: null });
  }

  return NextResponse.json({
    job: result.job,
    claimed_at: result.claimed_at,
    sourceDownloadUrl: result.sourceDownloadUrl,
    sourceDownloadUrlExpiresInSec: result.sourceDownloadUrlExpiresInSec,
    proxyUploadUrl: result.proxyUploadUrl,
    proxyUploadUrlExpiresInSec: result.proxyUploadUrlExpiresInSec,
    proxyUploadHeaders: result.proxyUploadHeaders,
    lease_expires_at: result.lease_expires_at,
    max_attempt_deadline_at: result.max_attempt_deadline_at,
    heartbeat_interval_ms: result.heartbeat_interval_ms,
    worker_id: result.worker_id,
    transcode_profile: result.job.transcode_profile,
  });
}
