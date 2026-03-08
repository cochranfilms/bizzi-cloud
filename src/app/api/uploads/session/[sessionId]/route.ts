import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    return await handleGetSession(request, sessionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/session] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleGetSession(request: Request, sessionId: string) {
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  let uid: string;
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
  } else {
    uid = "";
  }

  const db = getAdminFirestore();
  const sessionSnap = await db.collection("upload_sessions").doc(sessionId).get();

  if (!sessionSnap.exists) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const data = sessionSnap.data()!;
  if (!isDevAuthBypass() && data.userId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    sessionId: sessionSnap.id,
    objectKey: data.objectKey,
    uploadId: data.uploadId,
    status: data.status,
    fileSize: data.fileSize,
    partSize: data.partSize,
    totalParts: data.totalParts,
    completedPartNumbers: data.completedPartNumbers ?? [],
    partEtags: data.partEtags ?? {},
    bytesTransferred: data.bytesTransferred ?? 0,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}
