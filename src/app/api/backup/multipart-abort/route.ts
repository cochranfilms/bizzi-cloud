import { abortMultipartUpload, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleMultipartAbort(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[multipart-abort] Unhandled error:", message);
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleMultipartAbort(request: Request) {
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

  if (!isDevAuthBypass()) {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization" },
        { status: 401 }
      );
    }
    try {
      await verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const { object_key: objectKey, upload_id: uploadId } = body;

  if (
    !objectKey ||
    typeof objectKey !== "string" ||
    !uploadId ||
    typeof uploadId !== "string"
  ) {
    return NextResponse.json(
      { error: "object_key and upload_id are required" },
      { status: 400 }
    );
  }

  try {
    await abortMultipartUpload(objectKey, uploadId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to abort multipart upload";
    console.error("[multipart-abort] B2 error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
