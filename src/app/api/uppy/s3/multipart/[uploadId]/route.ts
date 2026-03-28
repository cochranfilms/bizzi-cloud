/**
 * Uppy S3 Multipart API — List parts (resume) or abort.
 * GET  /api/uppy/s3/multipart/[uploadId]?key=... → list uploaded parts
 * DELETE /api/uppy/s3/multipart/[uploadId]?key=... → abort upload
 */
import { abortMultipartUpload, isB2Configured, listMultipartUploadParts } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

async function getSessionAndVerify(
  uploadId: string,
  key: string,
  request: Request
): Promise<{ uid: string; data: Record<string, unknown> } | null> {
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
    if (snap.empty) return null;
    const data = snap.docs[0].data();
    return { uid: data.userId, data };
  }

  if (!token) return null;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return null;
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection("upload_sessions")
    .where("uploadId", "==", uploadId)
    .where("userId", "==", uid)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const data = snap.docs[0].data();
  if (decodeURIComponent(key) !== data.objectKey) return null;
  return { uid, data };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { uploadId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!uploadId || !key) {
    return NextResponse.json(
      { error: "uploadId and key (query) required" },
      { status: 400 }
    );
  }

  const session = await getSessionAndVerify(uploadId, key, request);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const objectKey = session.data.objectKey as string;
  try {
    const parts = await listMultipartUploadParts(objectKey, uploadId);
    return NextResponse.json(parts);
  } catch (err) {
    console.error("[uppy list parts] B2 ListParts failed:", err);
    const partEtags = (session.data.partEtags as Record<number, string>) ?? {};
    const fallback = Object.entries(partEtags).map(([num, etag]) => ({
      PartNumber: parseInt(num, 10),
      ETag: etag,
    }));
    return NextResponse.json(fallback);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  if (!isB2Configured()) {
    return NextResponse.json(
      { error: "Backblaze B2 is not configured" },
      { status: 503 }
    );
  }

  const { uploadId } = await params;
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!uploadId || !key) {
    return NextResponse.json(
      { error: "uploadId and key (query) required" },
      { status: 400 }
    );
  }

  const session = await getSessionAndVerify(uploadId, key, request);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const objectKey = session.data.objectKey as string;
  const db = getAdminFirestore();
  const snap = await db
    .collection("upload_sessions")
    .where("uploadId", "==", uploadId)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await snap.docs[0].ref.update({
    status: "aborted",
    updatedAt: new Date().toISOString(),
  });

  try {
    await abortMultipartUpload(objectKey, uploadId);
  } catch (err) {
    console.error("[uppy abort] B2 error:", err);
  }

  return NextResponse.json({ ok: true });
}
