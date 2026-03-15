/**
 * GET /api/notifications - List notifications for current user (paginated).
 * Query: ?limit=20&cursor=docId&unreadOnly=false
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { ensureNotificationMessage } from "@/lib/notification-format";
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

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10), 1), 50);
  const cursor = url.searchParams.get("cursor") ?? null;
  const unreadOnly = url.searchParams.get("unreadOnly") === "true";

  const db = getAdminFirestore();
  let q = db
    .collection("notifications")
    .where("recipientUserId", "==", uid)
    .orderBy("createdAt", "desc")
    .limit(limit + 1);

  if (unreadOnly) {
    q = db
      .collection("notifications")
      .where("recipientUserId", "==", uid)
      .where("isRead", "==", false)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);
  }

  if (cursor) {
    const cursorDoc = await db.collection("notifications").doc(cursor).get();
    if (cursorDoc.exists && cursorDoc.data()?.recipientUserId === uid) {
      q = q.startAfter(cursorDoc);
    }
  }

  const snap = await q.get();
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;

  const notifications = docs.map((d) => {
    const data = d.data();
    const n = {
      id: d.id,
      recipientUserId: data.recipientUserId,
      actorUserId: data.actorUserId,
      type: data.type,
      fileId: data.fileId ?? null,
      commentId: data.commentId ?? null,
      shareId: data.shareId ?? null,
      message: data.message ?? "",
      isRead: !!data.isRead,
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      metadata: data.metadata ?? null,
    };
    return ensureNotificationMessage(n as Parameters<typeof ensureNotificationMessage>[0]);
  });

  return NextResponse.json({
    notifications,
    nextCursor: hasMore ? docs[docs.length - 1].id : null,
    hasMore,
  });
}
