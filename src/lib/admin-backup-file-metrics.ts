/**
 * Admin-only: scan backup_files with the same "active for listing" rules as the product
 * (lifecycle_state + legacy deleted_at fallback). Firestore aggregate queries that only
 * match explicit lifecycle_state miss legacy rows, so totals and per-user splits must not
 * rely on that filter alone.
 */
import { FieldPath, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getCategoryFromFile } from "@/lib/analytics/category-map";
import {
  isBackupFileActiveForListing,
  isBackupFileReferencePointerRow,
} from "@/lib/backup-file-lifecycle";

const PAGE_SIZE = 2500;

export interface AdminBackupFileMetrics {
  totalBytes: number;
  activeFileCount: number;
  byCategory: Map<string, number>;
  bytesByUser: Map<string, number>;
  bytesByOrg: Map<string, number>;
  fileCountByUser: Map<string, number>;
  fileCountByOrg: Map<string, number>;
}

export async function aggregateActiveBackupFileMetrics(db: Firestore): Promise<AdminBackupFileMetrics> {
  const byCategory = new Map<string, number>();
  const bytesByUser = new Map<string, number>();
  const bytesByOrg = new Map<string, number>();
  const fileCountByUser = new Map<string, number>();
  const fileCountByOrg = new Map<string, number>();
  let totalBytes = 0;
  let activeFileCount = 0;

  let lastDoc: QueryDocumentSnapshot | undefined;

  for (;;) {
    let q = db.collection("backup_files").orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (!isBackupFileActiveForListing(data)) continue;
      if (isBackupFileReferencePointerRow(data)) continue;
      const size = typeof data.size_bytes === "number" ? data.size_bytes : 0;
      totalBytes += size;
      activeFileCount += 1;

      const orgId = data.organization_id;
      if (orgId && typeof orgId === "string") {
        bytesByOrg.set(orgId, (bytesByOrg.get(orgId) ?? 0) + size);
        fileCountByOrg.set(orgId, (fileCountByOrg.get(orgId) ?? 0) + 1);
      } else {
        const uid =
          (typeof data.userId === "string" && data.userId) ||
          (typeof data.owner_user_id === "string" && data.owner_user_id) ||
          "";
        if (uid) {
          bytesByUser.set(uid, (bytesByUser.get(uid) ?? 0) + size);
          fileCountByUser.set(uid, (fileCountByUser.get(uid) ?? 0) + 1);
        }
      }

      const relPath = (data.relative_path as string) ?? "";
      const cat = getCategoryFromFile(
        {
          id: doc.id,
          size_bytes: size,
          content_type: (data.content_type as string) ?? null,
          relative_path: relPath,
          usage_status: (data.usage_status as string) ?? null,
          deleted_at: data.deleted_at,
          isShared: false,
        },
        false
      );
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + size);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
  }

  return {
    totalBytes,
    activeFileCount,
    byCategory,
    bytesByUser,
    bytesByOrg,
    fileCountByUser,
    fileCountByOrg,
  };
}
