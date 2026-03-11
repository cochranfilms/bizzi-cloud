/**
 * GET /api/admin/uploads
 * Returns real upload metrics from Firestore upload_sessions.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "14", 10)));

  const db = getAdminFirestore();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const sessionsSnap = await db
    .collection("upload_sessions")
    .where("createdAt", ">=", todayIso)
    .get();

  let countToday = 0;
  let successToday = 0;
  let failedToday = 0;
  for (const d of sessionsSnap.docs) {
    const status = d.data().status;
    countToday++;
    if (status === "completed") successToday++;
    else if (status === "failed" || status === "aborted") failedToday++;
  }

  const successRate = countToday > 0 ? Math.round((successToday / countToday) * 1000) / 10 : 100;

  const byDate: Record<string, { count: number; successCount: number; failedCount: number }> = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dateStr = d.toISOString().slice(0, 10);
    byDate[dateStr] = { count: 0, successCount: 0, failedCount: 0 };
  }

  const allSessions = await db.collection("upload_sessions").get();
  for (const doc of allSessions.docs) {
    const data = doc.data();
    const createdAt = data.createdAt as string | undefined;
    if (!createdAt) continue;
    const dateStr = createdAt.slice(0, 10);
    if (!(dateStr in byDate)) continue;
    const status = data.status as string;
    byDate[dateStr].count++;
    if (status === "completed") byDate[dateStr].successCount++;
    else if (status === "failed" || status === "aborted") byDate[dateStr].failedCount++;
  }

  const volume = Object.entries(byDate).map(([date, v]) => ({
    date,
    count: v.count,
    successCount: v.successCount,
    failedCount: v.failedCount,
  }));

  const failureReasons: Record<string, number> = {};
  for (const doc of allSessions.docs) {
    const data = doc.data();
    if (data.status !== "failed" && data.status !== "aborted") continue;
    const reason = (data.error || data.status || "Unknown").toString();
    failureReasons[reason] = (failureReasons[reason] ?? 0) + 1;
  }
  const failures = Object.entries(failureReasons).map(([reason, count]) => ({ reason, count }));

  const response = NextResponse.json({
    metrics: {
      countToday,
      successRate,
      avgSpeedMbps: 0,
      failedCount: failedToday,
      retryRate: 0,
    },
    volume,
    failures,
  });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  return response;
}
