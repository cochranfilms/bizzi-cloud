/**
 * GET /api/admin/files
 * Returns active backup_files from Firestore (includes legacy rows without lifecycle_state).
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { aggregateActiveBackupFileMetrics } from "@/lib/admin-backup-file-metrics";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

function modifiedAtMillis(data: Record<string, unknown>): number {
  const m = data.modified_at;
  if (typeof m === "string") {
    const t = Date.parse(m);
    return Number.isFinite(t) ? t : 0;
  }
  if (
    m != null &&
    typeof m === "object" &&
    "toDate" in m &&
    typeof (m as { toDate: () => Date }).toDate === "function"
  ) {
    try {
      return (m as { toDate: () => Date }).toDate().getTime();
    } catch {
      return 0;
    }
  }
  return 0;
}

function mapDocToAdminFile(
  d: QueryDocumentSnapshot,
  authRecords: Map<string, { email?: string }>
) {
  const data = d.data() as Record<string, unknown>;
  const path = (data.relative_path as string) ?? "";
  const name = (path.split("/").filter(Boolean).pop() ?? path) || "?";
  const ext = name.includes(".") ? name.split(".").pop() ?? "" : "";
  const uid = (data.userId as string) ?? "";
  return {
    id: d.id,
    name,
    ownerId: uid,
    ownerEmail: authRecords.get(uid)?.email ?? "",
    sizeBytes: typeof data.size_bytes === "number" ? data.size_bytes : 0,
    mimeType: (data.content_type as string) ?? "application/octet-stream",
    extension: ext,
    folderPath: path ? "/" + path.split("/").slice(0, -1).join("/") : "/",
    status:
      data.deleted_at != null && data.deleted_at !== false
        ? "trash"
        : data.usage_status === "archived"
          ? "archived"
          : "active",
    shared: false,
    createdAt: (data.created_at as string) ?? new Date().toISOString(),
    modifiedAt: (data.modified_at as string) ?? new Date().toISOString(),
    flags: undefined as string[] | undefined,
  };
}

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const page = Math.min(50, Math.max(1, parseInt(searchParams.get("page") ?? "1", 10)));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "25", 10)));
  const ownerId = searchParams.get("ownerId") ?? "";

  const db = getAdminFirestore();
  const authService = getAdminAuth();

  let total = 0;
  let pageDocs: QueryDocumentSnapshot[] = [];

  if (ownerId) {
    const allSnap = await db.collection("backup_files").where("userId", "==", ownerId).get();
    const activeDocs = allSnap.docs.filter((doc) =>
      isBackupFileActiveForListing(doc.data() as Record<string, unknown>)
    );
    activeDocs.sort((a, b) => modifiedAtMillis(b.data() as Record<string, unknown>) - modifiedAtMillis(a.data() as Record<string, unknown>));
    total = activeDocs.length;
    pageDocs = activeDocs.slice((page - 1) * limit, page * limit);
  } else {
    const metrics = await aggregateActiveBackupFileMetrics(db);
    total = metrics.activeFileCount;

    const need = page * limit;
    const batchSize = 150;
    const collected: QueryDocumentSnapshot[] = [];
    let lastSnap: QueryDocumentSnapshot | undefined;

    while (collected.length < need) {
      let q = db.collection("backup_files").orderBy("modified_at", "desc").limit(batchSize);
      if (lastSnap) q = q.startAfter(lastSnap);
      const snap = await q.get();
      if (snap.empty) break;
      for (const doc of snap.docs) {
        if (!isBackupFileActiveForListing(doc.data() as Record<string, unknown>)) continue;
        collected.push(doc);
        if (collected.length >= need) break;
      }
      lastSnap = snap.docs[snap.docs.length - 1];
      if (snap.docs.length < batchSize) break;
    }

    pageDocs = collected.slice((page - 1) * limit, page * limit);
  }

  const uids = [...new Set(pageDocs.map((d) => (d.data().userId as string) ?? "").filter(Boolean))];
  const authRecords = new Map<string, { email?: string }>();
  for (let i = 0; i < uids.length; i += 100) {
    try {
      const result = await authService.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, { email: r.email });
      }
    } catch (_) {
      /* ignore */
    }
  }

  const files = pageDocs.map((d) => mapDocToAdminFile(d, authRecords));

  return NextResponse.json({ files, total, page, limit });
}
