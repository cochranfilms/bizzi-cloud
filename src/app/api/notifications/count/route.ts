/**
 * GET /api/notifications/count - Unread notification count for badge.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const db = getAdminFirestore();
  const snap = await db
    .collection("notifications")
    .where("recipientUserId", "==", uid)
    .where("isRead", "==", false)
    .count()
    .get();

  return NextResponse.json({ count: snap.data().count });
}
