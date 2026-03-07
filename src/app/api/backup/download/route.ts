import { createHmac } from "node:crypto";
import { isB2Configured } from "@/lib/b2";
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { object_key: objectKey, name: fileName, user_id: userIdFromBody } = body;

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

  const name = (typeof fileName === "string" ? fileName : null) ?? "download";

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
    if (snap.docs[0].data().deleted_at) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  } else {
    const prefix = `backups/${uid}/`;
    if (!objectKey.startsWith(prefix)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
  }

  try {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const secret = process.env.B2_SECRET_ACCESS_KEY;
    if (!secret) throw new Error("B2_SECRET_ACCESS_KEY not set");
    const payload = `backup-download|${objectKey}|${exp}`;
    const sig = createHmac("sha256", secret).update(payload).digest("base64url");
    const downloadUrl = `/api/backup/download-stream?object_key=${encodeURIComponent(objectKey)}&exp=${exp}&sig=${sig}&name=${encodeURIComponent(name)}`;
    return NextResponse.json({ url: downloadUrl });
  } catch (err) {
    console.error("[backup download] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create download URL" },
      { status: 500 }
    );
  }
}
