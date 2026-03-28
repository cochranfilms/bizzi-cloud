import {
  createMultipartUpload,
  createPresignedPartUrlsBatch,
  isB2Configured,
  objectExists,
  computeAdaptivePartPlan,
  MULTIPART_PRESIGN_EXPIRY,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { StorageQuotaDeniedError } from "@/lib/storage-quota-denied-error";
import { checkAndReserveUploadBytes } from "@/lib/storage-upload-reservation";
import { storageQuotaErrorJson } from "@/lib/storage-quota-http";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleMultipartInit(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[multipart-init] Unhandled error:", err);
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleMultipartInit(request: Request) {
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
  const { user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization. Sign out and back in to refresh your session, then try again." },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      console.error("[multipart-init] Token verification failed:", err?.code ?? err?.message);
      return NextResponse.json({ error: "Invalid or expired token. Sign out and back in." }, { status: 401 });
    }
  }

  const {
    drive_id: driveId,
    relative_path: relativePath,
    content_type: contentType,
    content_hash: contentHash,
    size_bytes: sizeBytes,
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
        objectKey,
        alreadyExists: true,
        uploadId: null,
        parts: null,
        reservation_id: null,
      });
    }
  }

  let reservation_id: string | null = null;
  try {
    const res = await checkAndReserveUploadBytes(
      uid,
      sizeBytes,
      typeof driveId === "string" ? driveId : undefined,
      objectKey
    );
    reservation_id = res.reservation_id;

    const { uploadId } = await createMultipartUpload(
      objectKey,
      typeof contentType === "string" ? contentType : "application/octet-stream"
    );

    const { partSize, totalParts } = computeAdaptivePartPlan(sizeBytes);
    const partNumbers = Array.from({ length: totalParts }, (_, i) => i + 1);
    const parts = await createPresignedPartUrlsBatch(
      objectKey,
      uploadId,
      partNumbers,
      MULTIPART_PRESIGN_EXPIRY
    );

    return NextResponse.json({
      objectKey,
      uploadId,
      parts,
      partSize,
      reservation_id,
    });
  } catch (err: unknown) {
    const q = storageQuotaErrorJson(err);
    if (q) {
      console.warn("[multipart-init] Quota denied", {
        storage_denial: err instanceof StorageQuotaDeniedError ? err.storage_denial : undefined,
      });
      return NextResponse.json(q.body, { status: q.status });
    }
    if (err instanceof Error && (err as Error & { code?: string }).code === "storage_reservation_race") {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (reservation_id) {
      await releaseReservation(reservation_id, "init_failed").catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Failed to initiate multipart upload";
    console.error("[multipart-init] B2 error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
