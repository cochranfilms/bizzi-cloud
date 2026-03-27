/**
 * GET /api/notifications/count - Unread notification count for badge (scoped by routing).
 * Query: ?routing=consumer|team:{uid}|enterprise:{orgId}
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  inferNotificationRoutingBucket,
  notificationVisibleForRouting,
} from "@/lib/notification-routing";
import { NextResponse } from "next/server";

const MAX_UNREAD_SCAN = 500;

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
  const routing = (url.searchParams.get("routing") ?? "consumer").trim() || "consumer";

  const db = getAdminFirestore();
  const snap = await db
    .collection("notifications")
    .where("recipientUserId", "==", uid)
    .where("isRead", "==", false)
    .orderBy("createdAt", "desc")
    .limit(MAX_UNREAD_SCAN)
    .get();

  let count = 0;
  for (const d of snap.docs) {
    const data = d.data();
    const bucket = inferNotificationRoutingBucket({
      type: data.type,
      routingBucket: data.routingBucket,
      metadata: data.metadata as Record<string, unknown> | null,
    });
    if (notificationVisibleForRouting(bucket, routing)) count++;
  }

  return NextResponse.json({ count });
}
