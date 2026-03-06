import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
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

  const body = await request.json();
  const { object_key: objectKey, user_id: userIdFromBody } = body;

  let uid: string;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization" },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key is required" },
      { status: 400 }
    );
  }

  // Content-hash keys: verify user owns a backup_files entry with this object_key
  if (objectKey.startsWith("content/")) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    // Legacy user-scoped keys
    const prefix = `backups/${uid}/`;
    if (!objectKey.startsWith(prefix)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  try {
    const url = await createPresignedDownloadUrl(objectKey, 3600);
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Preview URL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create preview URL" },
      { status: 500 }
    );
  }
}
