/**
 * GET /api/admin/files
 * Returns real files from Firestore backup_files collection.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const ownerId = searchParams.get("ownerId") ?? "";

  const db = getAdminFirestore();
  const authService = getAdminAuth();

  let q = db.collection("backup_files").where("deleted_at", "==", null);
  if (ownerId) {
    q = q.where("userId", "==", ownerId) as typeof q;
  }
  const totalSnap = await q.count().get();
  const total = totalSnap.data().count;

  q = q.orderBy("modified_at", "desc").limit(limit * page) as typeof q;
  const snap = await q.get();
  const pageDocs = snap.docs.slice((page - 1) * limit, page * limit);

  const uids = [...new Set(pageDocs.map((d) => d.data().userId as string).filter(Boolean))];
  const authRecords = new Map<string, { email?: string }>();
  for (let i = 0; i < uids.length; i += 100) {
    try {
      const result = await authService.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const [uid, r] of Object.entries(result.users)) {
        authRecords.set(uid, { email: r.email });
      }
    } catch (_) {}
  }

  const files = pageDocs.map((d) => {
    const data = d.data();
    const path = (data.relative_path as string) ?? "";
    const name = (path.split("/").filter(Boolean).pop() ?? path) || "?";
    const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
    return {
      id: d.id,
      name,
      ownerId: data.userId ?? "",
      ownerEmail: authRecords.get(data.userId ?? "")?.email ?? "",
      sizeBytes: typeof data.size_bytes === "number" ? data.size_bytes : 0,
      mimeType: (data.content_type as string) ?? "application/octet-stream",
      extension: ext,
      folderPath: path ? "/" + path.split("/").slice(0, -1).join("/") : "/",
      status: data.deleted_at ? "trash" : data.usage_status === "archived" ? "archived" : "active",
      shared: false,
      createdAt: (data.created_at as string) ?? new Date().toISOString(),
      modifiedAt: (data.modified_at as string) ?? new Date().toISOString(),
      flags: undefined as string[] | undefined,
    };
  });

  return NextResponse.json({ files, total, page, limit });
}
