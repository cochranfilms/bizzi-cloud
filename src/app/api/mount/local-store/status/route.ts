import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("device_id");

  let uid: string;
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (isDevAuthBypass() && url.searchParams.get("user_id")) {
    uid = url.searchParams.get("user_id")!;
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

  if (!deviceId) {
    return NextResponse.json(
      { error: "device_id query parameter required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection("local_store_entries")
    .where("user_id", "==", uid)
    .where("device_id", "==", deviceId)
    .get();

  const entries = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));

  return NextResponse.json({ entries });
}
