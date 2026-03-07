import { verifyIdToken } from "@/lib/firebase-admin";
import { getStorageStatus } from "@/lib/enterprise-storage";
import { NextResponse } from "next/server";

/**
 * GET - Current user's storage status (used bytes, quota, org vs personal).
 * Used by client to pre-check before upload and show quota-exceeded modal.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  try {
    const status = await getStorageStatus(uid);
    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to get storage status";
    console.error("[storage/status] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
