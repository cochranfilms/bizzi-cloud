import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  try {
    return await handleGetIncomplete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/incomplete] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleGetIncomplete(request: Request) {
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
    return NextResponse.json({ sessions: [] });
  }

  const db = getAdminFirestore();
  const snapshot = await db
    .collection("upload_sessions")
    .where("userId", "==", uid)
    .where("status", "in", ["pending", "uploading"])
    .get();

  const sessions = snapshot.docs.map((doc) => {
    const d = doc.data();
    return {
      sessionId: doc.id,
      objectKey: d.objectKey,
      uploadId: d.uploadId,
      status: d.status,
      fileName: d.fileName,
      fileSize: d.fileSize,
      partSize: d.partSize,
      totalParts: d.totalParts,
      completedPartNumbers: d.completedPartNumbers ?? [],
      bytesTransferred: d.bytesTransferred ?? 0,
      driveId: d.driveId,
      expiresAt: d.expiresAt,
      createdAt: d.createdAt,
    };
  });

  return NextResponse.json({ sessions });
}
