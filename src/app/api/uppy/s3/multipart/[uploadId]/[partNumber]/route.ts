/**
 * Uppy S3 Multipart API — Sign a single part (get presigned URL).
 * GET /api/uppy/s3/multipart/[uploadId]/[partNumber]?key=...
 */
import { createPresignedPartUrl, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uploadId: string; partNumber: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { uploadId, partNumber } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!uploadId || !partNumber || !key) {
    return NextResponse.json(
      { error: "uploadId, partNumber, and key (query) required" },
      { status: 400 }
    );
  }

  const partNum = parseInt(partNumber, 10);
  if (!Number.isInteger(partNum) || partNum < 1 || partNum > 10000) {
    return NextResponse.json({ error: "Invalid partNumber" }, { status: 400 });
  }

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass()) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("upload_sessions")
      .where("uploadId", "==", uploadId)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    uid = snap.docs[0].data().userId;
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

  const db = getAdminFirestore();
  const snap = await db
    .collection("upload_sessions")
    .where("uploadId", "==", uploadId)
    .where("userId", "==", uid)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const data = snap.docs[0].data();
  const sessionKey = data.objectKey;
  if (decodeURIComponent(key) !== sessionKey) {
    return NextResponse.json({ error: "Key mismatch" }, { status: 403 });
  }

  if (data.status === "aborted" || data.status === "completed") {
    return NextResponse.json({ error: "Session no longer active" }, { status: 410 });
  }

  const contentType = data.contentType ?? "application/octet-stream";

  try {
    const url = await createPresignedPartUrl(sessionKey, uploadId, partNum, 7 * 24 * 60 * 60);
    return NextResponse.json({
      url,
      method: "PUT",
      headers: { "Content-Type": contentType },
    });
  } catch (err) {
    console.error("[uppy sign part] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to sign part" },
      { status: 500 }
    );
  }
}
