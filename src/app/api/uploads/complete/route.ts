import {
  completeMultipartUpload,
  isB2Configured,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { checkUserCanUpload } from "@/lib/enterprise-storage";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleComplete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/complete] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleComplete(request: Request) {
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
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const {
    session_id: sessionId,
    object_key: objectKey,
    upload_id: uploadId,
    parts: partsInput,
    drive_id: driveId,
    relative_path: relativePath,
    content_type: contentType,
    size_bytes: sizeBytes,
    modified_at: modifiedAt,
    organization_id: organizationId,
  } = body;

  if (
    !objectKey ||
    typeof objectKey !== "string" ||
    !uploadId ||
    typeof uploadId !== "string" ||
    !Array.isArray(partsInput) ||
    partsInput.length === 0
  ) {
    return NextResponse.json(
      { error: "object_key, upload_id, and parts array are required" },
      { status: 400 }
    );
  }

  const validatedParts: { partNumber: number; etag: string }[] = [];
  for (const p of partsInput) {
    if (p && typeof p.partNumber === "number" && typeof p.etag === "string" && p.etag) {
      validatedParts.push({ partNumber: p.partNumber, etag: p.etag.replace(/^"|"$/g, "") });
    }
  }
  if (validatedParts.length === 0) {
    return NextResponse.json({ error: "No valid parts provided" }, { status: 400 });
  }

  const additionalBytes = typeof sizeBytes === "number" && sizeBytes >= 0 ? sizeBytes : 0;
  try {
    await checkUserCanUpload(uid, additionalBytes, typeof driveId === "string" ? driveId : undefined);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Storage limit reached";
    return NextResponse.json({ error: msg }, { status: 403 });
  }

  await completeMultipartUpload(objectKey, uploadId, validatedParts);

  const db = getAdminFirestore();
  if (sessionId && typeof sessionId === "string") {
    const sessionRef = db.collection("upload_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (sessionSnap.exists) {
      const data = sessionSnap.data();
      const partSize = data?.partSize ?? 0;
      const fileSize = data?.fileSize ?? typeof sizeBytes === "number" ? sizeBytes : 0;
      const partEtagsObj: Record<number, string> = {};
      for (const p of validatedParts) {
        partEtagsObj[p.partNumber] = p.etag;
      }
      await sessionRef.update({
        status: "completed",
        completedPartNumbers: validatedParts.map((p) => p.partNumber).sort((a, b) => a - b),
        partEtags: partEtagsObj,
        bytesTransferred: fileSize || validatedParts.length * partSize,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ objectKey, ok: true });
}
