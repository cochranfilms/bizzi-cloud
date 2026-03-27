/**
 * Short-TTL in-memory cache for GET /api/packages/list by drive + folder path.
 * Invalidates when BackupContext `storageVersion` changes (uploads/moves/trash).
 */
import type { MacosPackageListEntry } from "@/lib/macos-package-display";

const TTL_MS = 45_000;
const ERROR_TTL_MS = 8_000;

type Entry = { packages: MacosPackageListEntry[]; expiresAt: number };

const cache = new Map<string, Entry>();
let cacheStorageGeneration: number | null = null;

function normalizeFolderPath(folderPath: string | undefined): string {
  return (folderPath ?? "").replace(/^\/+/, "");
}

function cacheKey(driveId: string, folderPath: string): string {
  return `${driveId}\n${folderPath}`;
}

function alignCacheToStorageVersion(storageVersion: number): void {
  if (cacheStorageGeneration !== storageVersion) {
    cache.clear();
    cacheStorageGeneration = storageVersion;
  }
}

/**
 * Fetch packages for a drive path; uses cache while `storageVersion` matches and TTL not expired.
 */
export async function fetchPackagesListCached(options: {
  origin: string;
  token: string;
  driveId: string;
  folderPath?: string;
  storageVersion: number;
}): Promise<MacosPackageListEntry[]> {
  const folderPath = normalizeFolderPath(options.folderPath);
  alignCacheToStorageVersion(options.storageVersion);
  const key = cacheKey(options.driveId, folderPath);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.packages;
  }

  const url = `${options.origin}/api/packages/list?drive_id=${encodeURIComponent(options.driveId)}&folder_path=${encodeURIComponent(folderPath)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${options.token}` },
  });
  if (!res.ok) {
    cache.set(key, { packages: [], expiresAt: now + ERROR_TTL_MS });
    return [];
  }
  const data = (await res.json()) as { packages?: MacosPackageListEntry[] };
  const packages = data.packages ?? [];
  cache.set(key, { packages, expiresAt: now + TTL_MS });
  return packages;
}

/** Test hook or forced refresh after mutations if needed */
export function clearPackagesListCache(): void {
  cache.clear();
  cacheStorageGeneration = null;
}
