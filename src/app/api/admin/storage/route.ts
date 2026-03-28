/**
 * GET /api/admin/storage
 * Returns storage metrics from Firestore backup_files using the same active-file rules as the product.
 * Legacy rows without lifecycle_state are included (aggregate queries with lifecycle_state == active miss them).
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { aggregateActiveBackupFileMetrics } from "@/lib/admin-backup-file-metrics";

const CATEGORY_LABELS: Record<string, string> = {
  videos: "Videos",
  photos: "Photos",
  raw_photos: "RAW Photos",
  audio: "Audio",
  documents: "Documents",
  projects: "Projects",
  luts_presets: "LUTs / Presets",
  archived: "Archived Files",
  shared: "Shared With Others",
  trash: "Trash",
  system: "System / Versions / Backups",
  other: "Other",
};

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "10", 10)));

  const db = getAdminFirestore();
  const authService = getAdminAuth();

  const [profilesSnap, orgsSnap, metrics] = await Promise.all([
    db.collection("profiles").limit(10000).get(),
    db.collection("organizations").limit(1000).get(),
    aggregateActiveBackupFileMetrics(db),
  ]);

  let totalBytesFromProfiles = 0;

  for (const d of profilesSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    const orgId = data.organization_id;
    if (!orgId) {
      totalBytesFromProfiles += used;
    }
  }

  for (const d of orgsSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    totalBytesFromProfiles += used;
  }

  const totalBytes =
    metrics.totalBytes > 0 ? metrics.totalBytes : totalBytesFromProfiles;

  let sampledBytes = 0;
  for (const b of metrics.byCategory.values()) {
    sampledBytes += b;
  }

  const byCategoryArray = Array.from(metrics.byCategory.entries()).map(([id, bytes]) => ({
    id,
    label: CATEGORY_LABELS[id] ?? id,
    bytes,
    percent: sampledBytes > 0 ? Math.round((bytes / sampledBytes) * 1000) / 10 : 0,
  }));
  byCategoryArray.sort((a, b) => b.bytes - a.bytes);

  type SizedRow = { id: string; bytes: number };
  let sized: SizedRow[] = [
    ...[...metrics.bytesByUser.entries()].map(([id, bytes]) => ({ id, bytes })),
    ...[...metrics.bytesByOrg.entries()].map(([id, bytes]) => ({ id, bytes })),
  ].sort((a, b) => b.bytes - a.bytes);

  if (sized.length === 0 && totalBytesFromProfiles > 0) {
    const legacy: SizedRow[] = [];
    for (const d of profilesSnap.docs) {
      const data = d.data();
      if (data.organization_id) continue;
      const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
      if (used > 0) legacy.push({ id: d.id, bytes: used });
    }
    for (const d of orgsSnap.docs) {
      const data = d.data();
      const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
      if (used > 0) legacy.push({ id: d.id, bytes: used });
    }
    sized = legacy.sort((a, b) => b.bytes - a.bytes);
  }

  const sorted = sized.slice(0, limit);
  const authRecords = new Map<string, { email?: string; displayName?: string }>();

  const idsToTryAsUsers = sorted.map((p) => p.id);
  for (let i = 0; i < idsToTryAsUsers.length; i += 100) {
    const batch = idsToTryAsUsers.slice(i, i + 100);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, { email: r.email ?? undefined, displayName: r.displayName ?? undefined });
      }
    } catch (_) {
      /* ignore */
    }
  }

  const orgIds = new Set<string>();
  for (const p of sorted) {
    if (authRecords.has(p.id)) continue;
    try {
      const orgSnap = await db.collection("organizations").doc(p.id).get();
      if (orgSnap.exists) {
        orgIds.add(p.id);
        const data = orgSnap.data();
        authRecords.set(p.id, {
          displayName: (data?.name as string) ?? `Organization ${p.id.slice(0, 8)}`,
          email: (data?.owner_email as string) ?? "",
        });
      }
    } catch (_) {
      /* ignore */
    }
  }

  const largestAccounts = sorted.map((p) => ({
    id: p.id,
    name: authRecords.get(p.id)?.displayName || authRecords.get(p.id)?.email || "Unknown",
    email: authRecords.get(p.id)?.email ?? "",
    bytes: p.bytes,
    growthPercent: 0,
    fileCount: orgIds.has(p.id)
      ? (metrics.fileCountByOrg.get(p.id) ?? 0)
      : (metrics.fileCountByUser.get(p.id) ?? 0),
  }));

  return NextResponse.json({
    totalBytes,
    quotaBytes: null,
    byCategory: byCategoryArray,
    largestAccounts,
  });
}
