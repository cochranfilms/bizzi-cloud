/**
 * Standard FFmpeg proxy worker: claim next queued job (not BRAW).
 * POST JSON { worker_id: string } — Authorization: Bearer <MEDIA_STANDARD_WORKER_SECRET>
 */
import { NextResponse } from "next/server";
import { getAuthConfigStatus } from "@/lib/firebase-admin";
import { isB2Configured } from "@/lib/b2";
import { claimStandardProxyJob } from "@/lib/proxy-job-pipeline";
import {
  isStandardMediaWorkerConfigured,
  MEDIA_STANDARD_WORKER_SECRET_ENV,
  verifyMediaStandardWorkerRequestDetailed,
} from "@/lib/standard-media-worker";

export const maxDuration = 60;

/** Same heuristic as files/filter: Firestore composite index URL often appears in message. */
function isFirestoreIndexError(err: unknown): boolean {
  const e = err as { code?: number | string; message?: string; details?: unknown };
  const code = e?.code;
  const msg = `${e?.message ?? ""} ${typeof e?.details === "string" ? e.details : ""}`;
  const codeUpper = String(code ?? "").toUpperCase();
  return (
    code === 9 ||
    code === "FAILED_PRECONDITION" ||
    codeUpper === "FAILED_PRECONDITION" ||
    msg.includes("FAILED_PRECONDITION") ||
    msg.toLowerCase().includes("failed-precondition") ||
    msg.includes("requires an index") ||
    msg.includes("The query requires an index")
  );
}

function exposeInternalErrorDetails(): boolean {
  return process.env.VERCEL_ENV !== "production";
}

const REQUIRED_B2_VARS = [
  "B2_ACCESS_KEY_ID",
  "B2_SECRET_ACCESS_KEY",
  "B2_BUCKET_NAME",
  "B2_ENDPOINT",
] as const;

const REQUIRED_FIREBASE_FOR_CLAIM = ["FIREBASE_SERVICE_ACCOUNT_JSON"] as const;

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const t0 = Date.now();

  const line = (phase: string, data?: Record<string, unknown>) => {
    console.log(
      JSON.stringify({
        svc: "standard-proxy-claim",
        requestId,
        phase,
        ms: Date.now() - t0,
        ...data,
        at: new Date().toISOString(),
      })
    );
  };

  line("request_in");

  if (!isStandardMediaWorkerConfigured()) {
    line("auth_skip_secret_not_configured");
    return NextResponse.json(
      {
        error: "MEDIA_STANDARD_WORKER_SECRET is not configured",
        requestId,
        requiredEnv: [MEDIA_STANDARD_WORKER_SECRET_ENV],
      },
      { status: 503 }
    );
  }

  line("auth_start");
  const auth = verifyMediaStandardWorkerRequestDetailed(request);
  if (!auth.ok) {
    line("auth_fail", { reason: auth.reason });
    if (auth.reason === "missing_authorization") {
      return NextResponse.json(
        { error: "Unauthorized", code: "missing_authorization", requestId },
        { status: 401 }
      );
    }
    return NextResponse.json(
      { error: "Forbidden", code: "invalid_token", requestId },
      { status: 403 }
    );
  }
  line("auth_ok");

  const fb = getAuthConfigStatus();
  if (!fb.configured) {
    line("env_firestore_missing", {});
    return NextResponse.json(
      {
        error: "Firestore admin is not configured",
        requestId,
        requiredEnv: [...REQUIRED_FIREBASE_FOR_CLAIM],
      },
      { status: 503 }
    );
  }
  if (fb.parseError) {
    line("env_firestore_bad_json", { parseError: fb.parseError });
    return NextResponse.json(
      {
        error: "FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON",
        requestId,
        parseError: exposeInternalErrorDetails() ? fb.parseError : undefined,
      },
      { status: 503 }
    );
  }

  if (!isB2Configured()) {
    line("env_b2_missing", {});
    return NextResponse.json(
      {
        error: "Backblaze B2 is not configured",
        requestId,
        requiredEnv: [...REQUIRED_B2_VARS],
      },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
    line("body_parse_ok", {
      keys: body !== null && typeof body === "object" ? Object.keys(body as object) : [],
    });
  } catch (e) {
    line("body_parse_fail", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Invalid JSON", requestId }, { status: 400 });
  }

  const workerRaw =
    body !== null && typeof body === "object" && "worker_id" in body
      ? (body as { worker_id?: unknown }).worker_id
      : undefined;
  const workerId = typeof workerRaw === "string" ? workerRaw.trim() : "";
  line("worker_id_extracted", { ok: Boolean(workerId), len: workerId.length });
  if (!workerId) {
    return NextResponse.json({ error: "worker_id is required", requestId }, { status: 400 });
  }

  try {
    const claimLog = (phase: string, data?: Record<string, unknown>) =>
      line(`claim:${phase}`, data);

    const result = await claimStandardProxyJob(workerId, claimLog);

    if (!result) {
      line("response_no_job", {});
      return NextResponse.json({ job: null, requestId });
    }

    line("response_claimed", { jobId: result.job.id });
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
      requestId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      JSON.stringify({
        svc: "standard-proxy-claim",
        requestId,
        phase: "fatal",
        err: message,
        stack,
        at: new Date().toISOString(),
      })
    );
    if (err instanceof Error && stack) {
      console.error(stack);
    }

    if (typeof message === "string" && message.startsWith("B2_NOT_CONFIGURED")) {
      return NextResponse.json(
        {
          error: "Backblaze B2 is not configured",
          requestId,
          requiredEnv: [...REQUIRED_B2_VARS],
        },
        { status: 503 }
      );
    }

    if (
      typeof message === "string" &&
      (message.includes("FIREBASE_SERVICE_ACCOUNT_JSON") ||
        message.includes("Failed to parse service account"))
    ) {
      return NextResponse.json(
        {
          error: "Firestore admin configuration error",
          requestId,
          requiredEnv: [...REQUIRED_FIREBASE_FOR_CLAIM],
        },
        { status: 503 }
      );
    }

    if (isFirestoreIndexError(err)) {
      return NextResponse.json(
        {
          error: "Firestore query requires a composite index",
          code: "firestore_index_required",
          requestId,
          hint: exposeInternalErrorDetails() ? message : undefined,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: "internal_error",
        requestId,
        ...(exposeInternalErrorDetails()
          ? {
              message,
              stack,
            }
          : {}),
      },
      { status: 500 }
    );
  }
}
