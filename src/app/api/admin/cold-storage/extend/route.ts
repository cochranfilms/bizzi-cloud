/**
 * POST /api/admin/cold-storage/extend
 * Admin-only: Extend cold storage retention by 30 days for a folder or org.
 * Body: { folder?: string, orgId?: string, days?: number }
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";

const DEFAULT_EXTEND_DAYS = 30;

export async function POST(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  let body: { folder?: string; orgId?: string; days?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const folder = typeof body.folder === "string" ? body.folder.trim() : null;
  const orgId = typeof body.orgId === "string" ? body.orgId.trim() : null;
  const days = typeof body.days === "number" && body.days > 0
    ? body.days
    : DEFAULT_EXTEND_DAYS;

  if (!folder && !orgId) {
    return NextResponse.json(
      { error: "folder or orgId is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  let query = db.collection("cold_storage_files");
  if (orgId) {
    query = query.where("org_id", "==", orgId) as ReturnType<
      typeof db.collection
    >;
  } else {
    query = query.where("cold_storage_folder", "==", folder) as ReturnType<
      typeof db.collection
    >;
  }
  const snap = await query.get();

  let extended = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const current = d.cold_storage_expires_at as { toDate: () => Date } | undefined;
    const currentDate = current?.toDate?.() ?? new Date();
    const newExpires = new Date(currentDate);
    newExpires.setDate(newExpires.getDate() + days);
    await doc.ref.update({
      cold_storage_expires_at: Timestamp.fromDate(newExpires),
    });
    extended++;
  }

  return NextResponse.json({
    success: true,
    extended,
    message: `Extended retention by ${days} days for ${extended} file(s)`,
  });
}
