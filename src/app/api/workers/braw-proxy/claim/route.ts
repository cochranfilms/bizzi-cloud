/**
 * Dedicated Linux media worker: claim next BRAW proxy job.
 * POST JSON { worker_id: string } — Authorization: Bearer MEDIA_BRAW_WORKER_SECRET
 */
import { NextResponse } from "next/server";
import {
  BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE,
  verifyMediaBrawWorkerRequest,
} from "@/lib/braw-media-worker";
import { claimBrawProxyJob } from "@/lib/proxy-job-pipeline";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!process.env.MEDIA_BRAW_WORKER_SECRET?.trim()) {
    return NextResponse.json(
      {
        error: "MEDIA_BRAW_WORKER_SECRET is not configured",
        detail: BRAW_WORKER_NOT_CONFIGURED_USER_MESSAGE,
      },
      { status: 503 }
    );
  }
  if (!verifyMediaBrawWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { worker_id?: string };
  try {
    body = (await request.json()) as { worker_id?: string };
  } catch {
    body = {};
  }
  const workerId = typeof body.worker_id === "string" ? body.worker_id.trim() : "";
  if (!workerId) {
    return NextResponse.json({ error: "worker_id is required" }, { status: 400 });
  }

  const result = await claimBrawProxyJob(workerId);
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
    videoPosterUploadUrl: result.videoPosterUploadUrl,
    videoPosterUploadUrlExpiresInSec: result.videoPosterUploadUrlExpiresInSec,
    videoPosterUploadHeaders: result.videoPosterUploadHeaders,
    videoPosterSeekSec: result.videoPosterSeekSec,
    lease_expires_at: result.lease_expires_at,
    max_attempt_deadline_at: result.max_attempt_deadline_at,
    heartbeat_interval_ms: result.heartbeat_interval_ms,
    worker_id: result.worker_id,
  });
}
