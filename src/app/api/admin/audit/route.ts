/**
 * GET /api/admin/audit
 * Returns audit log entries. Uses admin_audit_log collection if it exists.
 * Returns empty until audit logging is implemented.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const action = searchParams.get("action") ?? "";
  const actorId = searchParams.get("actorId") ?? "";

  const db = getAdminFirestore();

  let q = db.collection("admin_audit_log").orderBy("timestamp", "desc");
  if (action) q = q.where("action", "==", action) as typeof q;
  if (actorId) q = q.where("actorId", "==", actorId) as typeof q;

  const totalSnap = await q.count().get();
  const total = totalSnap.data().count;

  const snap = await q.limit(limit * page).get();
  const pageDocs = snap.docs.slice((page - 1) * limit, page * limit);

  const entries = pageDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      actorId: data.actorId ?? "",
      actorEmail: data.actorEmail ?? "",
      action: data.action ?? "",
      targetType: data.targetType ?? "",
      targetId: data.targetId,
      timestamp: data.timestamp ?? new Date().toISOString(),
      metadata: data.metadata ?? {},
    };
  });

  return NextResponse.json({ entries, total, page, limit });
}
