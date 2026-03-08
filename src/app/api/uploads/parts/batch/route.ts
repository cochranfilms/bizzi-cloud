import {
  createPresignedPartUrlsBatch,
  isB2Configured,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
    return await handleBatchSign(request);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/parts/batch] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleBatchSign(request: Request) {
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
      return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
    }
    try {
      await verifyIdToken(token);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const { session_id: sessionId, object_key: objectKey, upload_id: uploadId, part_numbers: partNumbers } = body;

  if (
    !objectKey ||
    typeof objectKey !== "string" ||
    !uploadId ||
    typeof uploadId !== "string" ||
    !Array.isArray(partNumbers) ||
    partNumbers.length === 0
  ) {
    return NextResponse.json(
      { error: "object_key, upload_id, and part_numbers array are required" },
      { status: 400 }
    );
  }

  const validatedPartNumbers: number[] = [];
  for (const p of partNumbers) {
    if (typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 10000) {
      validatedPartNumbers.push(p);
    }
  }
  if (validatedPartNumbers.length === 0) {
    return NextResponse.json({ error: "No valid part numbers provided" }, { status: 400 });
  }

  if (sessionId && typeof sessionId === "string") {
    const db = getAdminFirestore();
    const sessionSnap = await db.collection("upload_sessions").doc(sessionId).get();
    if (sessionSnap.exists) {
      const data = sessionSnap.data();
      if (data?.status === "aborted" || data?.status === "completed") {
        return NextResponse.json({ error: "Upload session is no longer active" }, { status: 410 });
      }
    }
  }

  const parts = await createPresignedPartUrlsBatch(objectKey, uploadId, validatedPartNumbers, 3600);
  return NextResponse.json({ parts });
}
