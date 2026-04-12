/**
 * Uppy S3 API — Create backup_files record after presigned PUT upload (files ≤5MB).
 * For small files, Uppy uses presigned PUT directly to B2; no multipart complete is called.
 * The client calls this after a successful presigned upload so the file appears in Storage/Recent Uploads.
 * Core logic: `runBackupPresignedCompleteCore` in `@/lib/backup-presigned-complete-runner`.
 */
import { isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import {
  runBackupPresignedCompleteCore,
  type PresignedCompleteBody,
} from "@/lib/backup-presigned-complete-runner";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: PresignedCompleteBody;
  try {
    body = (await request.json()) as PresignedCompleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { driveId, relativePath, sizeBytes } = body;

  if (
    !driveId ||
    !relativePath ||
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return NextResponse.json(
      {
        error:
          "driveId, relativePath, and sizeBytes are required (0 allowed for empty files)",
      },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  let uid: string;
  let authEmail: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    authEmail = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const appOrigin = new URL(request.url).origin;

  return runBackupPresignedCompleteCore({
    body,
    uid,
    authEmail,
    token,
    appOrigin,
    proxyEnqueueSource: "ingest_presigned_complete",
  });
}
