/**
 * Metadata extraction worker: claim next queued large-video probe job.
 * POST { worker_id } — Authorization: Bearer MEDIA_STANDARD_WORKER_SECRET
 */
import { NextResponse } from "next/server";
import { isB2Configured } from "@/lib/b2";
import { getAuthConfigStatus } from "@/lib/firebase-admin";
import { claimMetadataExtractionJob } from "@/lib/metadata-extraction-job-pipeline";
import {
  isStandardMediaWorkerConfigured,
  MEDIA_STANDARD_WORKER_SECRET_ENV,
  verifyMediaStandardWorkerRequestDetailed,
} from "@/lib/standard-media-worker";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isStandardMediaWorkerConfigured()) {
    return NextResponse.json(
      {
        error: "MEDIA_STANDARD_WORKER_SECRET is not configured",
        requiredEnv: [MEDIA_STANDARD_WORKER_SECRET_ENV],
      },
      { status: 503 }
    );
  }
  const auth = verifyMediaStandardWorkerRequestDetailed(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason === "missing_authorization" ? "Unauthorized" : "Forbidden" },
      { status: auth.reason === "missing_authorization" ? 401 : 403 }
    );
  }

  const fb = getAuthConfigStatus();
  if (!fb.configured) {
    return NextResponse.json({ error: "Firestore admin is not configured" }, { status: 503 });
  }
  if (!isB2Configured()) {
    return NextResponse.json({ error: "Backblaze B2 is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const workerId =
    body !== null && typeof body === "object" && "worker_id" in body
      ? String((body as { worker_id?: unknown }).worker_id ?? "").trim()
      : "";
  if (!workerId) {
    return NextResponse.json({ error: "worker_id is required" }, { status: 400 });
  }

  try {
    const result = await claimMetadataExtractionJob(workerId);
    if (!result) {
      return NextResponse.json({ job: null });
    }
    return NextResponse.json({
      job: result.job,
      claimed_at: result.claimed_at,
      sourceDownloadUrl: result.sourceDownloadUrl,
      sourceDownloadUrlExpiresInSec: result.sourceDownloadUrlExpiresInSec,
    });
  } catch (err) {
    console.error("[metadata-extraction-claim]", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
