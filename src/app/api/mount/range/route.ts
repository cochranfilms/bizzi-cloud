import { getObject, getObjectRange, isB2Configured } from "@/lib/b2";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

function parseRange(rangeHeader: string | null): { start: number; end?: number } | null {
  if (!rangeHeader || !rangeHeader.startsWith("bytes=")) return null;
  const match = rangeHeader.replace(/^bytes=/, "").match(/(\d+)-(\d*)/);
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = match[2] ? parseInt(match[2], 10) : undefined;
  return { start, end };
}

async function verifyObjectAccess(uid: string, objectKey: string): Promise<boolean> {
  if (objectKey.startsWith("content/")) {
    const db = getAdminFirestore();
    const snap = await db
      .collection("backup_files")
      .where("userId", "==", uid)
      .where("object_key", "==", objectKey)
      .limit(1)
      .get();
    return !snap.empty;
  }
  const prefix = `backups/${uid}/`;
  return objectKey.startsWith(prefix);
}

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

  const hasAccess = await verifyObjectAccess(uid, objectKey);
  if (!hasAccess) {
    return new NextResponse(
      JSON.stringify({ error: "Access denied" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  const rangeHeader = request.headers.get("Range");
  const parsed = parseRange(rangeHeader);

  try {
    if (parsed) {
      const end = parsed.end ?? Number.MAX_SAFE_INTEGER;
      const { body, contentLength, contentRange } = await getObjectRange(objectKey, {
        start: parsed.start,
        end,
      });

      const headers: Record<string, string> = {
        "Accept-Ranges": "bytes",
        "Content-Length": String(contentLength),
      };
      if (contentRange) headers["Content-Range"] = contentRange;

      return new NextResponse(body as unknown as ReadableStream, {
        status: 206,
        headers,
      });
    }

    const { body, contentLength } = await getObject(objectKey);
    return new NextResponse(body as unknown as ReadableStream, {
      status: 200,
      headers: {
        "Content-Length": String(contentLength),
        "Accept-Ranges": "bytes",
      },
    });
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
