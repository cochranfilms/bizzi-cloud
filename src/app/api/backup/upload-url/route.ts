import { createPresignedUploadUrl, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
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
  const { user_id: userIdFromBody } = body;

  let uid: string;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        {
          error:
            "Missing or invalid Authorization. Sign out and back in to refresh your session, then try again.",
        },
        { status: 401 }
      );
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch (e) {
      const msg =
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON
          ? "Invalid or expired token. Sign out and back in, then try again."
          : "Server auth not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON (Vercel env).";
      return NextResponse.json({ error: msg }, { status: 401 });
    }
  }

  const { drive_id: driveId, relative_path: relativePath, content_type: contentType } = body;

  if (!driveId || !relativePath || typeof relativePath !== "string") {
    return NextResponse.json(
      { error: "drive_id and relative_path are required" },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");
  const objectKey = `backups/${uid}/${driveId}/${safePath}`;

  try {
    const url = await createPresignedUploadUrl(
      objectKey,
      contentType || "application/octet-stream",
      3600
    );
    return NextResponse.json({ uploadUrl: url, objectKey });
  } catch (err) {
    console.error("B2 presigned URL error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create upload URL" },
      { status: 500 }
    );
  }
}
