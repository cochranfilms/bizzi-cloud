import { completeMultipartUpload, isB2Configured } from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleMultipartComplete(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[multipart-complete] Unhandled error:", err);
    return NextResponse.json(
      { error: message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function handleMultipartComplete(request: Request) {
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

  const { object_key: objectKey, upload_id: uploadId, parts } = body;

  if (
    !objectKey ||
    typeof objectKey !== "string" ||
    !uploadId ||
    typeof uploadId !== "string" ||
    !Array.isArray(parts) ||
    parts.length === 0
  ) {
    return NextResponse.json(
      { error: "object_key, upload_id, and parts array are required" },
      { status: 400 }
    );
  }

  const validatedParts: { partNumber: number; etag: string }[] = [];
  for (const p of parts) {
    if (p && typeof p.partNumber === "number" && typeof p.etag === "string" && p.etag) {
      validatedParts.push({ partNumber: p.partNumber, etag: p.etag.replace(/^"|"$/g, "") });
    }
  }
  if (validatedParts.length === 0) {
    return NextResponse.json({ error: "No valid parts provided" }, { status: 400 });
  }

  try {
    await completeMultipartUpload(objectKey, uploadId, validatedParts);
    return NextResponse.json({ objectKey, ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to complete multipart upload";
    console.error("[multipart-complete] B2 error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
