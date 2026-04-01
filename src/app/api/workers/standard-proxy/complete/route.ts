/**
 * Standard proxy worker: mark job success or failure after B2 upload.
 * POST { job_id, worker_id, claimed_at, ok: boolean, error?, proxy_size_bytes?, proxy_duration_sec? }
 */
import { NextResponse } from "next/server";
import {
  completeProxyJobFailure,
  completeProxyJobSuccess,
} from "@/lib/proxy-job-pipeline";
import {
  isStandardMediaWorkerConfigured,
  verifyMediaStandardWorkerRequest,
} from "@/lib/standard-media-worker";

export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isStandardMediaWorkerConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  if (!verifyMediaStandardWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    job_id?: string;
    worker_id?: string;
    claimed_at?: string;
    ok?: boolean;
    error?: string;
    proxy_size_bytes?: number | null;
    proxy_duration_sec?: number | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const jobId = body.job_id?.trim();
  const workerId = body.worker_id?.trim();
  const claimedAt = body.claimed_at?.trim();
  if (!jobId || !workerId || !claimedAt || typeof body.ok !== "boolean") {
    return NextResponse.json(
      { error: "job_id, worker_id, claimed_at, ok boolean required" },
      { status: 400 }
    );
  }

  if (body.ok) {
    const r = await completeProxyJobSuccess({
      jobId,
      workerId,
      claimed_at: claimedAt,
      proxy_size_bytes: body.proxy_size_bytes,
      proxy_duration_sec: body.proxy_duration_sec,
    });
    if (!r.ok) {
      const status = r.code === "conflict" ? 409 : r.code === "validation_failed" ? 400 : 500;
      return NextResponse.json({ error: r.error ?? r.code }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  const errMsg = body.error?.trim() || "worker reported transcode failure";
  const r = await completeProxyJobFailure({
    jobId,
    workerId,
    claimed_at: claimedAt,
    error: errMsg,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.code }, { status: 409 });
  }
  return NextResponse.json({ ok: true, recorded: "failure" });
}
