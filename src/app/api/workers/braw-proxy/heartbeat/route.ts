/**
 * BRAW proxy worker: same lease / CAS semantics as standard worker.
 * POST { job_id, worker_id, claimed_at, status, progress_pct?, worker_version?, ffmpeg_version? }
 */
import { NextResponse } from "next/server";
import { verifyMediaBrawWorkerRequest } from "@/lib/braw-media-worker";
import { heartbeatProxyJob } from "@/lib/proxy-job-pipeline";
import { PROXY_JOB_STATUS, type ProxyJobCanonicalStatus } from "@/lib/proxy-job-config";

export const maxDuration = 30;

const ACTIVE: readonly string[] = [
  PROXY_JOB_STATUS.CLAIMED,
  PROXY_JOB_STATUS.DOWNLOADING,
  PROXY_JOB_STATUS.TRANSCODING,
  PROXY_JOB_STATUS.UPLOADING,
  "processing",
];

export async function POST(request: Request) {
  if (!process.env.MEDIA_BRAW_WORKER_SECRET?.trim()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!verifyMediaBrawWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    job_id?: string;
    worker_id?: string;
    claimed_at?: string;
    status?: string;
    progress_pct?: number | null;
    worker_version?: string | null;
    ffmpeg_version?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.job_id?.trim();
  const workerId = body.worker_id?.trim();
  const claimedAt = body.claimed_at?.trim();
  const status = body.status?.trim();
  if (!jobId || !workerId || !claimedAt || !status) {
    return NextResponse.json(
      { error: "job_id, worker_id, claimed_at, status required" },
      { status: 400 }
    );
  }
  if (!ACTIVE.includes(status)) {
    return NextResponse.json({ error: "invalid status for heartbeat" }, { status: 400 });
  }

  const r = await heartbeatProxyJob({
    jobId,
    workerId,
    claimed_at: claimedAt,
    status: status as ProxyJobCanonicalStatus,
    progress_pct: body.progress_pct,
    worker_version: body.worker_version,
    ffmpeg_version: body.ffmpeg_version,
  });

  if (!r.ok) {
    return NextResponse.json({ error: "conflict", code: r.code }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
