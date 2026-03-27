/**
 * GET /api/admin/platform-data/summary
 * Aggregate counts for admin Platform data hub (workspaces, shares, recent activity).
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const db = getAdminFirestore();
  const dayAgo = new Date();
  dayAgo.setHours(dayAgo.getHours() - 24);
  const cutoff = Timestamp.fromDate(dayAgo);

  try {
    const [workspacesSnap, sharesSnap, activityDaySnap, activityTotalSnap] = await Promise.all([
      db.collection("workspaces").count().get(),
      db.collection("folder_shares").count().get(),
      db.collection("activity_logs").where("created_at", ">=", cutoff).count().get(),
      db.collection("activity_logs").count().get(),
    ]);

    return NextResponse.json({
      workspaceCount: workspacesSnap.data().count,
      shareCount: sharesSnap.data().count,
      activityLogsLast24h: activityDaySnap.data().count,
      activityLogsTotal: activityTotalSnap.data().count,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[admin/platform-data/summary]", err);
    return NextResponse.json({ error: "Failed to load summary" }, { status: 500 });
  }
}
