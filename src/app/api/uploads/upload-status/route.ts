import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId =
      searchParams.get("session_id") ?? searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json(
        { error: "session_id query parameter is required" },
        { status: 400 }
      );
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

    const totalParts = data.totalParts ?? 0;
    const completed = (data.completedPartNumbers as number[] | undefined)?.length ?? 0;

    return NextResponse.json({
      session_id: sessionSnap.id,
      sessionId: sessionSnap.id,
      object_key: data.objectKey,
      objectKey: data.objectKey,
      upload_id: data.uploadId,
      uploadId: data.uploadId,
      upload_mode: data.upload_mode ?? "multipart",
      uploadMode: data.upload_mode ?? "multipart",
      status: data.status,
      file_size: data.fileSize,
      fileSize: data.fileSize,
      part_size: data.partSize,
      partSize: data.partSize,
      total_parts: totalParts,
      totalParts,
      parts_completed: completed,
      partsCompleted: completed,
      completed_part_numbers: data.completedPartNumbers ?? [],
      completedPartNumbers: data.completedPartNumbers ?? [],
      part_etags: data.partEtags ?? {},
      partEtags: data.partEtags ?? {},
      bytes_transferred: data.bytesTransferred ?? 0,
      bytesTransferred: data.bytesTransferred ?? 0,
      expires_at: data.expiresAt,
      expiresAt: data.expiresAt,
      created_at: data.createdAt,
      createdAt: data.createdAt,
      updated_at: data.updatedAt,
      updatedAt: data.updatedAt,
      relative_path: data.relative_path ?? null,
      relativePath: data.relative_path ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/upload-status] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
