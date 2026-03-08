import { getDownloadUrl } from "@/lib/cdn";
import { isB2Configured } from "@/lib/b2";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

/** Redirect to B2/CDN. Client re-sends Range header to presigned URL. No file bytes through Vercel (4.5 MB limit). */
export async function GET(request: Request) {
  if (!isB2Configured()) {
    return new NextResponse(
      JSON.stringify({ error: "Backblaze B2 is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && url.searchParams.get("user_id")) {
    uid = url.searchParams.get("user_id")!;
  } else if (!token) {
    return new NextResponse(
      JSON.stringify({ error: "Missing or invalid Authorization" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return new NextResponse(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  if (!objectKey || typeof objectKey !== "string") {
    return new NextResponse(
      JSON.stringify({ error: "object_key query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const hasAccess = await verifyBackupFileAccess(uid, objectKey);
  if (!hasAccess) {
    return new NextResponse(
      JSON.stringify({ error: "Access denied" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const directUrl = await getDownloadUrl(objectKey, 3600);
    return NextResponse.redirect(directUrl, 302);
  } catch (err) {
    console.error("Mount range error:", err);
    return new NextResponse(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Failed to fetch object",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
