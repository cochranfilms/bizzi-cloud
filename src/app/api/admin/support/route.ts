/**
 * GET /api/admin/support
 * Returns support tickets from support_tickets collection.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Timestamp } from "firebase-admin/firestore";

function toIso(val: unknown): string {
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && "toDate" in val && typeof (val as Timestamp).toDate === "function") {
    return (val as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.min(50, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
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
      message: data.message ?? "",
      issueType: data.issueType ?? "other",
      affectedUserId: data.affectedUserId ?? "",
      affectedUserEmail: data.affectedUserEmail ?? "",
      status: data.status ?? "open",
      createdAt: toIso(data.createdAt),
      updatedAt: toIso(data.updatedAt),
    };
  });

  // Approximate breakdown (capped for scale) — use separate count queries for exact at scale
  const breakdown: Record<string, number> = {};
  const breakdownSnap = await db.collection("support_tickets").limit(2000).get();
  for (const d of breakdownSnap.docs) {
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
