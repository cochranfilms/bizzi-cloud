/**
 * GET /api/admin/storage
 * Returns real storage metrics from Firestore (profiles, organizations, backup_files).
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import { requireAdminAuth } from "@/lib/admin-auth";
import { NextResponse } from "next/server";
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

  const profilesSnap = await db.collection("profiles").get();
  const orgsSnap = await db.collection("organizations").get();

  let totalBytes = 0;
  const profileStorage: Array<{ id: string; bytes: number }> = [];

  for (const d of profilesSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    const orgId = data.organization_id;
    if (!orgId) {
      totalBytes += used;
      profileStorage.push({ id: d.id, bytes: used });
    }
  }

  for (const d of orgsSnap.docs) {
    const data = d.data();
    const used = typeof data.storage_used_bytes === "number" ? data.storage_used_bytes : 0;
    totalBytes += used;
  }

  const byCategory = new Map<string, number>();
  const filesSnap = await db.collection("backup_files").limit(5000).get();
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
  const uids = sorted.map((p) => p.id);
  const authRecords = new Map<string, { email?: string; displayName?: string }>();
  for (let i = 0; i < uids.length; i += 100) {
    const batch = uids.slice(i, i + 100);
    try {
      const result = await authService.getUsers(batch.map((uid) => ({ uid })));
      for (const r of result.users) {
        authRecords.set(r.uid, { email: r.email, displayName: r.displayName ?? undefined });
      }
    } catch (_) {}
  }

  const fileCounts = new Map<string, number>();
  for (const uid of uids) {
    const snap = await db.collection("backup_files").where("userId", "==", uid).where("deleted_at", "==", null).count().get();
    fileCounts.set(uid, snap.data().count);
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
