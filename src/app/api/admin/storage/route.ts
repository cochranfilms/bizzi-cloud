/**
 * GET /api/admin/storage
 * Returns real storage metrics from Firestore (profiles, organizations, backup_files).
 * Uses aggregation for total bytes (no capped sampling).
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
import { AggregateField } from "firebase-admin/firestore";
import { getCategoryFromFile } from "@/lib/analytics/category-map";

const CATEGORY_LABELS: Record<string, string> = {
  videos: "Videos",
  photos: "Photos",
  raw_photos: "RAW Photos",
  audio: "Audio",
  documents: "Documents",
  projects: "Projects",
  luts_presets: "LUTs / Presets",
  other: "Other",
};

export async function GET(request: Request) {
  const auth = await requireAdminAuth(request);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(50, Math.max(5, parseInt(searchParams.get("limit") ?? "10", 10)));

  const db = getAdminFirestore();
  const authService = getAdminAuth();

  const [profilesSnap, orgsSnap, filesSnap, aggSnap] = await Promise.all([
    db.collection("profiles").limit(10000).get(),
    db.collection("organizations").limit(1000).get(),
    db.collection("backup_files").limit(5000).get(),
    (async () => {
      try {
        const q = db.collection("backup_files").where("deleted_at", "==", null);
        const agg = q.aggregate({ totalBytes: AggregateField.sum("size_bytes") });
        return await agg.get();
      } catch {
        return null;
      }
    })(),
  ]);

  let totalBytesFromProfiles = 0;
  const profileStorage: Array<{ id: string; bytes: number }> = [];

  for (const d of profilesSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    const orgId = data.organization_id;
    if (!orgId) {
      totalBytesFromProfiles += used;
      profileStorage.push({ id: d.id, bytes: used });
    }
  }

  for (const d of orgsSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    totalBytesFromProfiles += used;
  }

  let totalBytesFromFiles = 0;
  if (aggSnap) {
    totalBytesFromFiles = Number(aggSnap.data().totalBytes ?? 0);
  }

  const totalBytes =
    totalBytesFromProfiles > 0 && totalBytesFromProfiles >= totalBytesFromFiles
      ? totalBytesFromProfiles
      : totalBytesFromFiles;

  // Update profile storage for largest accounts when profile bytes are stale (use actual file sums)
  if (totalBytesFromProfiles === 0 && totalBytesFromFiles > 0) {
    const bytesByUser = new Map<string, number>();
    const bytesByOrg = new Map<string, number>();
    for (const doc of filesSnap.docs) {
      const data = doc.data();
      if (data.deleted_at) continue;
      const size = typeof data.size_bytes === "number" ? data.size_bytes : 0;
      const orgId = data.organization_id;
      if (orgId) {
        bytesByOrg.set(orgId, (bytesByOrg.get(orgId) ?? 0) + size);
      } else {
        const uid = data.userId;
        if (uid) bytesByUser.set(uid, (bytesByUser.get(uid) ?? 0) + size);
      }
    }
    profileStorage.length = 0;
    for (const [id, bytes] of bytesByUser) {
      profileStorage.push({ id, bytes });
    }
    // Add orgs as pseudo-accounts (id = orgId, lookup by org doc for name)
    const orgBytes = Array.from(bytesByOrg.entries())
      .map(([id, bytes]) => ({ id, bytes }))
      .sort((a, b) => b.bytes - a.bytes);
    for (const { id, bytes } of orgBytes.slice(0, limit)) {
      profileStorage.push({ id, bytes });
    }
    profileStorage.sort((a, b) => b.bytes - a.bytes);
  }

  const byCategory = new Map<string, number>();
  let sampledBytes = 0;
  for (const doc of filesSnap.docs) {
    const data = doc.data();
    if (data.deleted_at) continue;
    const size = typeof data.size_bytes === "number" ? data.size_bytes : 0;
    sampledBytes += size;
    const cat = getCategoryFromFile(
      {
        ...data,
        isShared: false,
      } as Parameters<typeof getCategoryFromFile>[0],
      false
    );
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + size);
  }

  const byCategoryArray = Array.from(byCategory.entries()).map(([id, bytes]) => ({
    id,
    label: CATEGORY_LABELS[id] ?? id,
    bytes,
    percent: sampledBytes > 0 ? Math.round((bytes / sampledBytes) * 1000) / 10 : 0,
  }));
  byCategoryArray.sort((a, b) => b.bytes - a.bytes);

  const sorted = profileStorage.sort((a, b) => b.bytes - a.bytes).slice(0, limit);
  const authRecords = new Map<string, { email?: string; displayName?: string }>();

  const idsToTryAsUsers = sorted.map((p) => p.id);
  for (let i = 0; i < idsToTryAsUsers.length; i += 100) {
    const batch = idsToTryAsUsers.slice(i, i + 100);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, { email: r.email ?? undefined, displayName: r.displayName ?? undefined });
      }
    } catch (_) {}
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
    } catch (_) {}
  }

  const fileCounts = new Map<string, number>();
  for (const p of sorted) {
    if (orgIds.has(p.id)) {
      const snap = await db.collection("backup_files").where("organization_id", "==", p.id).where("deleted_at", "==", null).count().get();
      fileCounts.set(p.id, snap.data().count);
    } else {
      const snap = await db.collection("backup_files").where("userId", "==", p.id).where("deleted_at", "==", null).count().get();
      fileCounts.set(p.id, snap.data().count);
    }
  }

  const largestAccounts = sorted.map((p) => ({
    id: p.id,
    name: authRecords.get(p.id)?.displayName || authRecords.get(p.id)?.email || "Unknown",
    email: authRecords.get(p.id)?.email ?? "",
    bytes: p.bytes,
    growthPercent: 0,
    fileCount: fileCounts.get(p.id) ?? 0,
  }));

  return NextResponse.json({
    totalBytes,
    quotaBytes: null,
    byCategory: byCategoryArray,
    largestAccounts,
  });
}
