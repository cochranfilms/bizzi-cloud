/**
 * GET /api/admin/cold-storage/files?folder=...
 * Admin-only: List files in a cold storage folder.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const folder = searchParams.get("folder")?.trim();
  const orgId = searchParams.get("orgId")?.trim();

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

  const files = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      relative_path: d.relative_path ?? "",
      object_key: d.object_key ?? "",
      size_bytes: d.size_bytes ?? 0,
      cold_storage_expires_at: d.cold_storage_expires_at?.toDate?.()?.toISOString() ?? null,
    };
  });

  return NextResponse.json({ files });
}
