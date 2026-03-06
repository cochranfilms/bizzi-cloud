import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const {
    device_name,
    platform,
    stream_cache_path,
    stream_cache_max_bytes,
    local_store_path,
    user_id: userIdFromBody,
  } = body;

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && userIdFromBody) {
    uid = userIdFromBody;
  } else if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  } else {
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }
  }

  const db = getAdminFirestore();
  const deviceId = randomUUID();
  const now = new Date().toISOString();

  await db.collection("devices").doc(deviceId).set({
    id: deviceId,
    user_id: uid,
    device_name: device_name ?? "Bizzi Cloud Desktop",
    platform: platform ?? process.platform,
    last_seen_at: now,
    stream_cache_path: stream_cache_path ?? null,
    stream_cache_max_bytes: stream_cache_max_bytes ?? 50 * 1024 * 1024 * 1024,
    local_store_path: local_store_path ?? null,
    created_at: now,
  });

  return NextResponse.json({ device_id: deviceId });
}
