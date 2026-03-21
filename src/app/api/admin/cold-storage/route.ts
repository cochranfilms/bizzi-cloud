/**
 * GET /api/admin/cold-storage
 * Admin-only: List cold storage aggregated by folder.
 * Query: ?sourceType=org_removal|subscription_end|account_delete to filter.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get("sourceType")?.trim() || null;

  const db = getAdminFirestore();
  let query = db.collection("cold_storage_files");
  if (sourceType) {
    query = query.where("source_type", "==", sourceType) as ReturnType<
      typeof db.collection
    >;
  }
  const snap = await query.get();

  const byFolder = new Map<
    string,
    {
      folder: string;
      ownerType: string;
      sourceType: string;
      planTier: string;
      fileCount: number;
      totalBytes: number;
      coldStorageStartedAt: string | null;
      expiresAt: string | null;
      orgId: string | null;
      orgName: string | null;
      userId: string | null;
      fileIds: string[];
    }
  >();

  for (const doc of snap.docs) {
    const d = doc.data();
    const ownerType = (d.owner_type as string) ?? (d.org_id ? "organization" : "consumer");
    const orgId = (d.org_id as string) ?? null;
    const userId = (d.user_id as string) ?? null;
    const folder = (d.cold_storage_folder as string) ?? "unknown";
    const key = orgId ? `org:${orgId}` : `user:${userId ?? folder}`;

    if (!byFolder.has(key)) {
      byFolder.set(key, {
        folder,
        ownerType,
        sourceType: (d.source_type as string) ?? "org_removal",
        planTier: (d.plan_tier as string) ?? "enterprise",
        fileCount: 0,
        totalBytes: 0,
        coldStorageStartedAt: d.cold_storage_started_at?.toDate?.()?.toISOString() ?? null,
        expiresAt: d.cold_storage_expires_at?.toDate?.()?.toISOString() ?? null,
        orgId,
        orgName: (d.org_name as string) ?? null,
        userId: orgId ? null : userId,
        fileIds: [],
      });
    }
    const entry = byFolder.get(key)!;
    entry.fileCount += 1;
    entry.totalBytes += typeof d.size_bytes === "number" ? d.size_bytes : 0;
    entry.fileIds.push(doc.id);
  }

  const folders = Array.from(byFolder.values()).sort((a, b) =>
    (a.expiresAt ?? "").localeCompare(b.expiresAt ?? "")
  );

  return NextResponse.json({
    folders,
    totalFolders: folders.length,
    totalFiles: folders.reduce((s, f) => s + f.fileCount, 0),
    totalBytes: folders.reduce((s, f) => s + f.totalBytes, 0),
  });
}
