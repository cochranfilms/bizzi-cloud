import { isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallbackAndLifecycle } from "@/lib/backup-access";
import { verifyIdToken, getAdminFirestore } from "@/lib/firebase-admin";
import { resolveBackupVideoStreamPayloadFromSnap } from "@/lib/backup-video-stream-resolve";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
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
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { object_key: objectKey, user_id: userIdFromBody } = body;

  let uid: string;
  if (isDevAuthBypass() && typeof userIdFromBody === "string") {
    uid = userIdFromBody;
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

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json({ error: "object_key is required" }, { status: 400 });
  }

  const result = await verifyBackupFileAccessWithGalleryFallbackAndLifecycle(uid, objectKey);
  if (!result.allowed) {
    console.warn("[video-stream-url] Access denied", {
      uid,
      objectKeyPrefix: objectKey.slice(0, 50),
      status: result.status,
    });
    return NextResponse.json(
      { error: result.message ?? "Access denied" },
      { status: result.status ?? 403 }
    );
  }

  try {
    const db = getAdminFirestore();
    const muxSnap = await db
      .collection("backup_files")
      .where("object_key", "==", objectKey)
      .limit(5)
      .get();

    const payload = await resolveBackupVideoStreamPayloadFromSnap(uid, objectKey, muxSnap);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("[video-stream-url] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create stream URL" },
      { status: 500 }
    );
  }
}
