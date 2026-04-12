import {
  createMultipartUpload,
  createPresignedPartUrlsBatch,
  createPresignedUploadUrl,
  objectExists,
  isB2Configured,
  computeAdaptivePartPlan,
  MULTIPART_PRESIGN_EXPIRY,
  MULTIPART_THRESHOLD,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkAndReserveUploadBytes } from "@/lib/storage-upload-reservation";
import { storageQuotaErrorJson } from "@/lib/storage-quota-http";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { buildBackupObjectKey, sanitizeBackupRelativePath } from "@/lib/backup-object-key";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const SESSION_EXPIRY_HOURS = 24;
const MAX_PARTS_IN_RESPONSE = 200;

export async function handleStartUpload(request: Request): Promise<NextResponse> {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body: expected JSON" },
      { status: 400 }
    );
  }

  let uid: string;
  if (isDevAuthBypass() && typeof body.user_id === "string") {
    uid = body.user_id;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization" },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const driveId = body.drive_id ?? body.driveId;
  const relativePath = body.relative_path ?? body.relativePath;
  const contentType =
    typeof body.content_type === "string"
      ? body.content_type
      : typeof body.contentType === "string"
        ? body.contentType
        : "application/octet-stream";
  const contentHash = body.content_hash ?? body.contentHash;
  const fileFingerprint = body.file_fingerprint ?? body.fileFingerprint;
  const sizeBytesRaw = body.size_bytes ?? body.sizeBytes;
  const fileName = body.file_name ?? body.fileName;
  const lastModified = body.last_modified ?? body.lastModified;
  const workspaceId = body.workspace_id ?? body.workspaceId;
  const source = body.source === "desktop" || body.source === "web" ? body.source : "web";
  const preferredModeRaw = body.preferred_upload_mode ?? body.preferredUploadMode;
  const preferredUploadMode =
    preferredModeRaw === "single_put" ||
    preferredModeRaw === "multipart" ||
    preferredModeRaw === "auto"
      ? preferredModeRaw
      : "auto";

  if (
    !driveId ||
    !relativePath ||
    typeof relativePath !== "string" ||
    typeof sizeBytesRaw !== "number" ||
    !Number.isFinite(sizeBytesRaw) ||
    sizeBytesRaw < 0
  ) {
    return NextResponse.json(
      {
        error:
          "drive_id, relative_path, and size_bytes are required (0 allowed for empty files)",
      },
      { status: 400 }
    );
  }

  const sizeBytes = sizeBytesRaw;

  const safePath = sanitizeBackupRelativePath(relativePath);
  const objectKey = buildBackupObjectKey({
    pathSubjectUid: uid,
    driveId: String(driveId),
    relativePath: safePath,
    contentHash:
      contentHash && typeof contentHash === "string" && /^[a-f0-9]{64}$/i.test(contentHash)
        ? contentHash
        : null,
  });

  if (objectKey.startsWith("content/")) {
    const exists = await objectExists(objectKey);
    if (exists) {
      return NextResponse.json({
        sessionId: null,
        uploadMode: "single_put" as const,
        objectKey,
        uploadId: null,
        recommendedPartSize: 0,
        recommendedConcurrency: 0,
        totalParts: 0,
        parts: [],
        alreadyExists: true,
        existingObjectKey: objectKey,
        reservation_id: null,
      });
    }
  }

  let reservation_id: string | null = null;
  try {
    const r = await checkAndReserveUploadBytes(
      uid,
      sizeBytes,
      typeof driveId === "string" ? driveId : undefined,
      objectKey
    );
    reservation_id = r.reservation_id;
  } catch (err) {
    const q = storageQuotaErrorJson(err);
    if (q) return NextResponse.json(q.body, { status: q.status });
    if (err instanceof Error && (err as Error & { code?: string }).code === "storage_reservation_race") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  /** Large files always use multipart; explicit `multipart` forces it for any size. */
  const useMultipart =
    preferredUploadMode === "multipart" || sizeBytes >= MULTIPART_THRESHOLD;

  const db = getAdminFirestore();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);
  const expiresIso = expiresAt.toISOString();

  if (!useMultipart) {
    let putUrl: string;
    try {
      putUrl = await createPresignedUploadUrl(
        objectKey,
        contentType,
        3600
      );
    } catch (initErr) {
      if (reservation_id) {
        await releaseReservation(reservation_id, "init_failed").catch(() => {});
      }
      throw initErr;
    }

    const sessionRef = await db.collection("upload_sessions").add({
      userId: uid,
      workspaceId: workspaceId ?? null,
      driveId,
      objectKey,
      uploadId: null,
      upload_mode: "single_put",
      source,
      relative_path: safePath,
      status: "pending",
      fileFingerprint: fileFingerprint ?? null,
      fileName: (typeof fileName === "string" ? fileName : relativePath) as string,
      fileSize: sizeBytes,
      lastModified: lastModified ?? null,
      contentType,
      partSize: 0,
      totalParts: 0,
      completedPartNumbers: [],
      partEtags: {},
      bytesTransferred: 0,
      retryCount: 0,
      expiresAt: expiresIso,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      storage_quota_reservation_id: reservation_id,
    });

    return NextResponse.json({
      sessionId: sessionRef.id,
      uploadMode: "single_put" as const,
      objectKey,
      putUrl,
      uploadUrl: putUrl,
      requiredHeaders: {
        "Content-Type": contentType,
        "x-amz-server-side-encryption": "AES256",
      },
      expiresAt: expiresIso,
      reservation_id,
      uploadId: null,
      recommendedPartSize: 0,
      recommendedConcurrency: 0,
      totalParts: 0,
      parts: [],
      alreadyExists: false,
    });
  }

  const { partSize, totalParts, recommendedConcurrency } = computeAdaptivePartPlan(sizeBytes);

  let uploadId: string;
  try {
    const m = await createMultipartUpload(objectKey, contentType);
    uploadId = m.uploadId;
  } catch (initErr) {
    if (reservation_id) {
      await releaseReservation(reservation_id, "init_failed").catch(() => {});
    }
    throw initErr;
  }

  const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
  const partsToSign =
    totalParts <= MAX_PARTS_IN_RESPONSE
      ? partNumbers
      : partNumbers.slice(0, MAX_PARTS_IN_RESPONSE);
  const parts = await createPresignedPartUrlsBatch(objectKey, uploadId, partsToSign, MULTIPART_PRESIGN_EXPIRY);

  const sessionRef = await db.collection("upload_sessions").add({
    userId: uid,
    workspaceId: workspaceId ?? null,
    driveId,
    objectKey,
    uploadId,
    upload_mode: "multipart",
    source,
    relative_path: safePath,
    status: "pending",
    fileFingerprint: fileFingerprint ?? null,
    fileName: (typeof fileName === "string" ? fileName : relativePath) as string,
    fileSize: sizeBytes,
    lastModified: lastModified ?? null,
    contentType,
    partSize,
    totalParts,
    completedPartNumbers: [],
    partEtags: {},
    bytesTransferred: 0,
    retryCount: 0,
    expiresAt: expiresIso,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    storage_quota_reservation_id: reservation_id,
  });

  return NextResponse.json({
    sessionId: sessionRef.id,
    uploadMode: "multipart" as const,
    objectKey,
    uploadId,
    recommendedPartSize: partSize,
    recommendedConcurrency,
    totalParts,
    parts,
    expiresAt: expiresIso,
    reservation_id,
    alreadyExists: false,
  });
}
