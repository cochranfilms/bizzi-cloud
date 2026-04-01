/**
 * Client-side cache for Google Drive browse listings to avoid re-fetching the same folder
 * during back/forward navigation. Cleared on explicit refresh.
 */

const TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { payload: T; storedAt: number };

const folderCache = new Map<string, CacheEntry<unknown>>();

export function googleBrowseCacheKey(folderId: string): string {
  return folderId.trim() || "root";
}

export function getCachedGoogleBrowse<T>(folderId: string): T | null {
  const key = googleBrowseCacheKey(folderId);
  const hit = folderCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.storedAt > TTL_MS) {
    folderCache.delete(key);
    return null;
  }
  return hit.payload as T;
}

export function setCachedGoogleBrowse<T>(folderId: string, payload: T): void {
  folderCache.set(googleBrowseCacheKey(folderId), { payload, storedAt: Date.now() });
}

export function clearGoogleBrowseCache(): void {
  folderCache.clear();
}
