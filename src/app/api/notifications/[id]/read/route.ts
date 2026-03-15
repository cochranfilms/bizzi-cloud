/**
 * PATCH /api/notifications/[id]/read - Mark a single notification as read.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Notification ID required" }, { status: 400 });

  const db = getAdminFirestore();
  const ref = db.collection("notifications").doc(id);
  const doc = await ref.get();
  if (!doc.exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.data()?.recipientUserId !== uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ref.update({ isRead: true });
  return NextResponse.json({ ok: true });
}
