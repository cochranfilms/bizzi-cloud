import { isB2Configured } from "@/lib/b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { createPresignedUploadUrl } from "@/lib/b2";

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

  const body = await request.json().catch(() => ({}));
  const {
    file_id: fileId,
    object_key: objectKey,
    device_id: deviceId,
    user_id: userIdFromBody,
  } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return NextResponse.json(
      { error: "object_key required for upload" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const filesSnap = await db
    .collection("backup_files")
    .where("userId", "==", uid)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();

  if (filesSnap.empty) {
    const prefix = `backups/${uid}/`;
    if (!objectKey.startsWith(prefix)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  const contentType = body.content_type ?? "application/octet-stream";
  const url = await createPresignedUploadUrl(objectKey, contentType, 3600);

  return NextResponse.json({ upload_url: url });
}
