import {
  createMultipartUpload,
  createPresignedPartUrlsBatch,
  objectExists,
  isB2Configured,
  computeAdaptivePartPlan,
  MULTIPART_PRESIGN_EXPIRY,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkAndReserveUploadBytes } from "@/lib/storage-upload-reservation";
import { storageQuotaErrorJson } from "@/lib/storage-quota-http";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import type { UploadCreateResponse } from "@/types/upload";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const SESSION_EXPIRY_HOURS = 24;

export async function POST(request: Request) {
  try {
    return await handleCreate(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/create] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleCreate(request: Request) {
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

  const {
    drive_id: driveId,
    relative_path: relativePath,
    content_type: contentType,
    content_hash: contentHash,
    file_fingerprint: fileFingerprint,
    size_bytes: sizeBytes,
    file_name: fileName,
    last_modified: lastModified,
    workspace_id: workspaceId,
  } = body;

  if (
    !driveId ||
    !relativePath ||
    typeof relativePath !== "string" ||
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0
  ) {
    return NextResponse.json(
      {
        error:
          "drive_id, relative_path, and size_bytes are required (0 allowed for empty files)",
      },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  const objectKey =
    contentHash && typeof contentHash === "string" && /^[a-f0-9]{64}$/i.test(contentHash)
      ? `content/${contentHash.toLowerCase()}`
      : `backups/${uid}/${driveId}/${safePath}`;

  if (objectKey.startsWith("content/")) {
    const exists = await objectExists(objectKey);
    if (exists) {
      return NextResponse.json({
        sessionId: null,
        objectKey,
        uploadId: null,
        recommendedPartSize: 0,
        recommendedConcurrency: 0,
        totalParts: 0,
        parts: [],
        alreadyExists: true,
        existingObjectKey: objectKey,
        reservation_id: null,
      } satisfies UploadCreateResponse);
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

  const { partSize, totalParts, recommendedConcurrency } = computeAdaptivePartPlan(sizeBytes);

  let uploadId: string;
  try {
    const m = await createMultipartUpload(
      objectKey,
      typeof contentType === "string" ? contentType : "application/octet-stream"
    );
    uploadId = m.uploadId;
  } catch (initErr) {
    if (reservation_id) {
      await releaseReservation(reservation_id, "init_failed").catch(() => {});
    }
    throw initErr;
  }

  const MAX_PARTS_IN_RESPONSE = 200;
  const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
  const partsToSign =
    totalParts <= MAX_PARTS_IN_RESPONSE
      ? partNumbers
      : partNumbers.slice(0, MAX_PARTS_IN_RESPONSE);
  const parts = await createPresignedPartUrlsBatch(objectKey, uploadId, partsToSign, MULTIPART_PRESIGN_EXPIRY);

  const db = getAdminFirestore();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

  const sessionRef = await db.collection("upload_sessions").add({
    userId: uid,
    workspaceId: workspaceId ?? null,
    driveId,
    objectKey,
    uploadId,
    status: "pending",
    fileFingerprint: fileFingerprint ?? null,
    fileName: fileName ?? relativePath,
    fileSize: sizeBytes,
    lastModified: lastModified ?? null,
    contentType: typeof contentType === "string" ? contentType : "application/octet-stream",
    partSize,
    totalParts,
    completedPartNumbers: [],
    partEtags: {},
    bytesTransferred: 0,
    retryCount: 0,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    storage_quota_reservation_id: reservation_id,
  });

  return NextResponse.json({
    sessionId: sessionRef.id,
    objectKey,
    uploadId,
    recommendedPartSize: partSize,
    recommendedConcurrency,
    totalParts,
    parts,
    alreadyExists: false,
    reservation_id,
  } satisfies UploadCreateResponse);
}
