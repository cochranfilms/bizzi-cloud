/**
 * Uppy S3 Multipart API — Create multipart upload.
 * POST /api/uppy/s3/multipart
 * Body: { filename, type, metadata: { driveId, relativePath, sizeBytes, workspaceId?, ... } }
 * Returns: { key, uploadId }
 */
import {
  createMultipartUpload,
  createPresignedPartUrlsBatch,
  isB2Configured,
  computeAdaptivePartPlan,
  MULTIPART_PRESIGN_EXPIRY,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkUserCanUpload } from "@/lib/enterprise-storage";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

const SESSION_EXPIRY_HOURS = 24;
const MAX_PARTS_IN_RESPONSE = 200;

export async function POST(request: Request) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  let body: { filename?: string; type?: string; metadata?: Record<string, string> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { filename, type, metadata = {} } = body;
  const driveId = metadata.driveId ?? metadata.drive_id;
  const relativePath = metadata.relativePath ?? metadata.relative_path ?? filename ?? "";
  const sizeBytes = parseInt(metadata.sizeBytes ?? metadata.size_bytes ?? "0", 10);
  const workspaceId = metadata.workspaceId ?? metadata.workspace_id ?? null;
  const lastModified =
    metadata.lastModified != null ? parseInt(String(metadata.lastModified), 10) : null;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && metadata.user_id) {
    uid = metadata.user_id;
  } else if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!driveId || !relativePath || !sizeBytes || sizeBytes <= 0) {
    return NextResponse.json(
      { error: "metadata must include driveId, relativePath, sizeBytes" },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  try {
    await checkUserCanUpload(uid, sizeBytes, driveId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage limit reached";
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  const objectKey = `backups/${uid}/${driveId}/${safePath}`;
  const contentType = type ?? "application/octet-stream";
  const { partSize, totalParts } = computeAdaptivePartPlan(sizeBytes);

  const { uploadId } = await createMultipartUpload(objectKey, contentType);

  const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
  const partsToSign =
    totalParts <= MAX_PARTS_IN_RESPONSE
      ? partNumbers
      : partNumbers.slice(0, MAX_PARTS_IN_RESPONSE);
  const parts = await createPresignedPartUrlsBatch(
    objectKey,
    uploadId,
    partsToSign,
    MULTIPART_PRESIGN_EXPIRY
  );

  const db = getAdminFirestore();
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + SESSION_EXPIRY_HOURS);

  await db.collection("upload_sessions").add({
    userId: uid,
    workspaceId: workspaceId ?? null,
    driveId,
    objectKey,
    uploadId,
    status: "pending",
    fileFingerprint: null,
    fileName: filename ?? relativePath,
    fileSize: sizeBytes,
    lastModified,
    contentType,
    partSize,
    totalParts,
    completedPartNumbers: [],
    partEtags: {},
    bytesTransferred: 0,
    retryCount: 0,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ key: objectKey, uploadId });
}
