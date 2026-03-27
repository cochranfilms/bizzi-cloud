/**
 * Client-side aggregation helpers for storage analytics.
 * Used by API route during Firestore iteration.
 */

import { getCategoryFromFile } from "./category-map";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";

export interface FileRecord {
  id: string;
  relative_path?: string;
  size_bytes: number;
  content_type?: string | null;
  usage_status?: string | null;
  deleted_at?: unknown;
  lifecycle_state?: unknown;
  modified_at?: string | null;
  created_at?: string | null;
  raw_format?: string | null;
}

export interface CategoryAggregate {
  id: string;
  label: string;
  bytes: number;
  count: number;
  percent: number;
  largestFile?: { id: string; name: string; size: number };
  avgSize?: number;
}

export interface MonthlyUpload {
  month: string;
  bytes: number;
}

export interface StorageAnalyticsSummary {
  totalUsedBytes: number;
  totalQuotaBytes: number | null;
  remainingBytes: number;
  totalFileCount: number;
  lastUpdated: string;
  categories: CategoryAggregate[];
  activeBytes: number;
  archivedBytes: number;
  trashBytes: number;
  sharedBytes: number;
  versionBytes: number;
  largestFiles: Array<{ id: string; name: string; size: number; category: string }>;
  fastestGrowingCategory?: string;
  oldFiles90DaysCount?: number;
  compressionOpportunities?: number;
  /** Bytes uploaded this month */
  uploadBytesThisMonth?: number;
  /** Bytes uploaded last month */
  uploadBytesLastMonth?: number;
  /** Monthly upload volume for last 6 months */
  monthlyUploads?: MonthlyUpload[];
}

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

/**
 * Aggregate files into category summaries.
 */
export function aggregateFiles(
  files: FileRecord[],
  sharedFileIds: Set<string>,
  totalUsedBytes: number,
  quotaBytes: number | null
): Omit<StorageAnalyticsSummary, "lastUpdated"> {
  const now = new Date().toISOString();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const d = new Date(now);
  const startOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const startOfLastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();

  const byCategory = new Map<
    string,
    { bytes: number; count: number; files: FileRecord[] }
  >();

  let archivedBytes = 0;
  let trashBytes = 0;
  let sharedBytes = 0;
  let uploadBytesThisMonth = 0;
  let uploadBytesLastMonth = 0;
  let oldFiles90DaysCount = 0;

  const allLargest: Array<{ id: string; name: string; size: number; cat: string }> = [];

  for (const file of files) {
    const size = typeof file.size_bytes === "number" ? file.size_bytes : 0;
    const isShared = sharedFileIds.has(file.id);
    const isDeleted = file.deleted_at != null;
    const isArchived = file.usage_status === "archived";

    const cat = getCategoryFromFile(
      { ...file, isShared } as Parameters<typeof getCategoryFromFile>[0],
      isShared
    );

    if (!byCategory.has(cat)) {
      byCategory.set(cat, { bytes: 0, count: 0, files: [] });
    }
    const agg = byCategory.get(cat)!;
    agg.bytes += size;
    agg.count += 1;
    agg.files.push(file);

    if (isDeleted) trashBytes += size;
    else if (isArchived) archivedBytes += size;
    if (isShared) sharedBytes += size;

    const createdAt = file.created_at
      ? new Date(file.created_at).getTime()
      : null;
    if (createdAt && createdAt >= startOfThisMonth) uploadBytesThisMonth += size;
    else if (createdAt && createdAt >= startOfLastMonth && createdAt < startOfThisMonth)
      uploadBytesLastMonth += size;

    const modifiedAt = file.modified_at
      ? new Date(file.modified_at).getTime()
      : null;
    if (modifiedAt && modifiedAt < ninetyDaysAgo.getTime()) oldFiles90DaysCount++;

    allLargest.push({
      id: file.id,
      name: (file.relative_path ?? "").split("/").pop() ?? "?",
      size,
      cat,
    });
  }

  const categories: CategoryAggregate[] = [];
  for (const [id, agg] of byCategory) {
    const largest = agg.files.reduce(
      (a, f) =>
        (f.size_bytes ?? 0) > (a?.size_bytes ?? 0) ? f : a,
      agg.files[0]
    );
    const percent =
      totalUsedBytes > 0 ? (agg.bytes / totalUsedBytes) * 100 : 0;
    categories.push({
      id,
      label: CATEGORY_LABELS[id] ?? id,
      bytes: agg.bytes,
      count: agg.count,
      percent,
      largestFile: largest
        ? {
            id: largest.id,
            name:
              (largest.relative_path ?? "").split("/").pop() ?? "?",
            size: largest.size_bytes ?? 0,
          }
        : undefined,
      avgSize: agg.count > 0 ? agg.bytes / agg.count : undefined,
    });
  }

  // Sort categories by bytes descending
  categories.sort((a, b) => b.bytes - a.bytes);

  // Top 10 largest files
  allLargest.sort((a, b) => b.size - a.size);
  const largestFiles = allLargest.slice(0, 10).map((f) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    category: f.cat,
  }));

  // Fastest growing: compare this month vs last month by category
  const thisMonthByCat = new Map<string, number>();
  const lastMonthByCat = new Map<string, number>();
  for (const file of files) {
    const cat = getCategoryFromFile(
      { ...file, isShared: sharedFileIds.has(file.id) } as Parameters<
        typeof getCategoryFromFile
      >[0],
      sharedFileIds.has(file.id)
    );
    const createdAt = file.created_at
      ? new Date(file.created_at).getTime()
      : null;
    const size = file.size_bytes ?? 0;
    if (createdAt && createdAt >= startOfThisMonth) {
      thisMonthByCat.set(cat, (thisMonthByCat.get(cat) ?? 0) + size);
    } else if (
      createdAt &&
      createdAt >= startOfLastMonth &&
      createdAt < startOfThisMonth
    ) {
      lastMonthByCat.set(cat, (lastMonthByCat.get(cat) ?? 0) + size);
    }
  }
  let fastestGrowingCategory: string | undefined;
  let maxGrowth = 0;
  for (const [cat, thisVal] of thisMonthByCat) {
    const lastVal = lastMonthByCat.get(cat) ?? 0;
    const growth = thisVal - lastVal;
    if (growth > maxGrowth) {
      maxGrowth = growth;
      fastestGrowingCategory = cat;
    }
  }

  const remainingBytes =
    quotaBytes != null ? Math.max(0, quotaBytes - totalUsedBytes) : 0;

  const monthlyUploads: MonthlyUpload[] = [];
  const today = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const monthStart = d.getTime();
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime();
    let sum = 0;
    for (const file of files) {
      const created = file.created_at
        ? new Date(file.created_at).getTime()
        : null;
      if (created != null && created >= monthStart && created <= monthEnd) {
        sum += file.size_bytes ?? 0;
      }
    }
    monthlyUploads.push({
      month: d.toISOString().slice(0, 7),
      bytes: sum,
    });
  }

  return {
    totalUsedBytes,
    totalQuotaBytes: quotaBytes,
    remainingBytes,
    totalFileCount: files.filter((f) =>
      isBackupFileActiveForListing(f as unknown as Record<string, unknown>)
    ).length,
    categories,
    activeBytes: totalUsedBytes,
    archivedBytes,
    trashBytes,
    sharedBytes,
    versionBytes: 0,
    largestFiles,
    fastestGrowingCategory: fastestGrowingCategory
      ? CATEGORY_LABELS[fastestGrowingCategory]
      : undefined,
    oldFiles90DaysCount,
    compressionOpportunities: 0,
    uploadBytesThisMonth,
    uploadBytesLastMonth,
    monthlyUploads,
  };
}
