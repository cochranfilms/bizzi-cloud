/**
 * Metadata extraction worker: post ffprobe JSON results.
 * POST { backup_file_id, worker_id, claimed_at, ok, error?, ffprobe_json? }
 */
import { NextResponse } from "next/server";
import {
  completeMetadataExtractionFailure,
  completeMetadataExtractionSuccess,
} from "@/lib/metadata-extraction-job-pipeline";
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
    backup_file_id?: string;
    worker_id?: string;
    claimed_at?: string;
    ok?: boolean;
    error?: string;
    ffprobe_json?: Record<string, unknown>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const backupFileId = body.backup_file_id?.trim();
  const workerId = body.worker_id?.trim();
  const claimedAt = body.claimed_at?.trim();
  if (!backupFileId || !workerId || !claimedAt || typeof body.ok !== "boolean") {
    return NextResponse.json(
      { error: "backup_file_id, worker_id, claimed_at, ok boolean required" },
      { status: 400 }
    );
  }

  if (body.ok) {
    const fj = body.ffprobe_json;
    if (!fj || typeof fj !== "object") {
      return NextResponse.json({ error: "ffprobe_json required when ok" }, { status: 400 });
    }
    const r = await completeMetadataExtractionSuccess({
      backupFileId,
      workerId,
      claimed_at: claimedAt,
      ffprobe_json: fj,
    });
    if (!r.ok) {
      const status =
        r.code === "conflict" ? 409 : r.code === "not_found" ? 404 : 500;
      return NextResponse.json({ error: r.error ?? r.code }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  const errMsg = body.error?.trim() || "metadata probe failed";
  const r = await completeMetadataExtractionFailure({
    backupFileId,
    workerId,
    claimed_at: claimedAt,
    error: errMsg,
  });
  if (!r.ok) {
    return NextResponse.json({ error: r.code }, { status: 409 });
  }
  return NextResponse.json({ ok: true, recorded: "failure" });
}
