import {
  createPresignedPartUrl,
  isB2Configured,
  MULTIPART_PRESIGN_EXPIRY,
} from "@/lib/b2";
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  try {
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

    const objectKey = body.object_key ?? body.objectKey;
    const uploadId = body.upload_id ?? body.uploadId;
    const partNumberRaw = body.part_number ?? body.partNumber;
    const sessionId = body.session_id ?? body.sessionId;

    if (
      !objectKey ||
      typeof objectKey !== "string" ||
      !uploadId ||
      typeof uploadId !== "string" ||
      typeof partNumberRaw !== "number" ||
      !Number.isInteger(partNumberRaw) ||
      partNumberRaw < 1 ||
      partNumberRaw > 10000
    ) {
      return NextResponse.json(
        { error: "object_key, upload_id, and part_number (1–10000) are required" },
        { status: 400 }
      );
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

    const uploadUrl = await createPresignedPartUrl(
      objectKey,
      uploadId,
      partNumberRaw,
      MULTIPART_PRESIGN_EXPIRY
    );
    return NextResponse.json({
      part_number: partNumberRaw,
      partNumber: partNumberRaw,
      upload_url: uploadUrl,
      uploadUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[uploads/sign-part] Unhandled error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
