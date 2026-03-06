import {
  createPresignedUploadUrl,
  isB2Configured,
  objectExists,
} from "@/lib/b2";
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body: expected JSON" },
      { status: 400 }
    );
  }
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
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      const code = err?.code;
      const message = err?.message ?? "";
      let msg: string;
      if (
        !process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
        message.includes("is not set")
      ) {
        msg =
          "FIREBASE_SERVICE_ACCOUNT_JSON is not set in Vercel. Add it (full JSON from Firebase Console > Service Accounts > Generate key).";
      } else if (message.includes("invalid JSON") || message.includes("parse")) {
        msg =
          "FIREBASE_SERVICE_ACCOUNT_JSON has invalid JSON. Paste the full minified JSON—ensure newlines in private_key are \\n.";
      } else if (code === "auth/id-token-expired") {
        msg = "Token expired. Refresh the page, sign out and back in, then try again.";
      } else if (code === "auth/argument-error" || code === "auth/invalid-id-token") {
        msg =
          "Project mismatch: FIREBASE_SERVICE_ACCOUNT_JSON must be from the same Firebase project as NEXT_PUBLIC_FIREBASE_PROJECT_ID. Check /api/backup/auth-status";
      } else {
        msg = "Invalid or expired token. Sign out and back in. Check /api/backup/auth-status for config.";
      }
      console.error("[upload-url] Token verification failed:", code ?? message);
      return NextResponse.json({ error: msg }, { status: 401 });
    }
  }

  const {
    drive_id: driveId,
    relative_path: relativePath,
    content_type: contentType,
    content_hash: contentHash,
    validate_only: validateOnly,
  } = body;

  if (validateOnly === true) {
    return NextResponse.json({ ok: true, uid });
  }

  if (!driveId || !relativePath || typeof relativePath !== "string") {
    return NextResponse.json(
      { error: "drive_id and relative_path are required" },
      { status: 400 }
    );
  }

  const safePath = relativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  // Content-hash storage: store by SHA256 hash for deduplication
  const objectKey =
    contentHash && typeof contentHash === "string" && /^[a-f0-9]{64}$/i.test(contentHash)
      ? `content/${contentHash.toLowerCase()}`
      : `backups/${uid}/${driveId}/${safePath}`;

  try {
    // If using content-hash, check if object already exists (deduplication)
    if (objectKey.startsWith("content/")) {
      const exists = await objectExists(objectKey);
      if (exists) {
        return NextResponse.json({
          uploadUrl: null,
          objectKey,
          alreadyExists: true,
        });
      }
    }

    const url = await createPresignedUploadUrl(
      objectKey,
      contentType || "application/octet-stream",
      3600
    );
    return NextResponse.json({ uploadUrl: url, objectKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create upload URL";
    const name = err instanceof Error ? err.name : undefined;
    console.error("[upload-url] B2 error:", name ?? "Unknown", message, err);

    // Surface actionable hints for common B2 config issues
    let userMessage = message;
    if (
      typeof message === "string" &&
      (message.includes("InvalidAccessKeyId") ||
        message.includes("SignatureDoesNotMatch") ||
        message.includes("credentials"))
    ) {
      userMessage =
        "B2 credentials invalid. Check B2_ACCESS_KEY_ID and B2_SECRET_ACCESS_KEY in your environment.";
    } else if (typeof message === "string" && message.includes("NoSuchBucket")) {
      userMessage =
        "B2 bucket not found. Check B2_BUCKET_NAME and B2_ENDPOINT match your Backblaze B2 bucket.";
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
