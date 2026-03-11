/**
 * GET /api/admin/support
 * Returns support tickets from support_tickets collection.
 * Returns empty until support ticket system is implemented.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const status = searchParams.get("status") ?? "";
  const priority = searchParams.get("priority") ?? "";

  const db = getAdminFirestore();

  let q = db.collection("support_tickets").orderBy("createdAt", "desc");
  if (status) q = q.where("status", "==", status) as typeof q;
  if (priority) q = q.where("priority", "==", priority) as typeof q;

  const totalSnap = await q.count().get();
  const total = totalSnap.data().count;

  const snap = await q.limit(limit * page).get();
  const pageDocs = snap.docs.slice((page - 1) * limit, page * limit);

  const tickets = pageDocs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      priority: data.priority ?? "medium",
      subject: data.subject ?? "",
      issueType: data.issueType ?? "other",
      affectedUserId: data.affectedUserId ?? "",
      affectedUserEmail: data.affectedUserEmail ?? "",
      status: data.status ?? "open",
      createdAt: data.createdAt ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    };
  });

  const breakdown: Record<string, number> = {};
  const allSnap = await db.collection("support_tickets").get();
  for (const d of allSnap.docs) {
    const type = (d.data().issueType ?? "other") as string;
    breakdown[type] = (breakdown[type] ?? 0) + 1;
  }

  return NextResponse.json({
    tickets,
    total,
    page,
    limit,
    breakdown,
  });
}
