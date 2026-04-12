import { abortMultipartUpload, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { releaseReservation } from "@/lib/storage-quota-reservations";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleAbort(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/abort] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleAbort(request: Request) {
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

  let uid: string | null = null;
  if (!isDevAuthBypass()) {
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

  const sessionId = body.session_id ?? body.sessionId;
  const objectKey = body.object_key ?? body.objectKey;
  const uploadId = body.upload_id ?? body.uploadId;

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const db = getAdminFirestore();

  if (uploadId && typeof uploadId === "string") {
    try {
      await abortMultipartUpload(objectKey, uploadId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to abort multipart upload";
      console.error("[uploads/abort] B2 error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } else if (sessionId && typeof sessionId === "string") {
    const sessionRef = db.collection("upload_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (!sessionSnap.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const data = sessionSnap.data()!;
    if (uid && data.userId !== uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (data.objectKey !== objectKey) {
      return NextResponse.json({ error: "object_key does not match session" }, { status: 400 });
    }
    if (data.upload_mode === "single_put") {
      const rid = data.storage_quota_reservation_id;
      if (typeof rid === "string" && rid.length > 0) {
        await releaseReservation(rid, "client_abort").catch(() => {});
      }
    }
  } else {
    return NextResponse.json(
      { error: "upload_id is required for multipart abort, or session_id for single-part abort" },
      { status: 400 }
    );
  }

  if (sessionId && typeof sessionId === "string") {
    const sessionRef = db.collection("upload_sessions").doc(sessionId);
    const sessionSnap = await sessionRef.get();
    if (sessionSnap.exists) {
      await sessionRef.update({
        status: "aborted",
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
