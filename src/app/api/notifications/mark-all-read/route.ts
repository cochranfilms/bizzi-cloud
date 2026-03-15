/**
 * POST /api/notifications/mark-all-read - Mark all notifications as read.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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
    .limit(500)
    .get();

  const batch = db.batch();
  for (const d of snap.docs) {
    batch.update(d.ref, { isRead: true });
  }
  await batch.commit();

  return NextResponse.json({ ok: true, updated: snap.size });
}
