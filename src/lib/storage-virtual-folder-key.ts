const STORAGE_VIRTUAL_KEY_PREFIX = "storage-seg:";

/** Stable folder row key for a first-level path inside Storage (parseable; drive id may contain hyphens). */
export function buildStorageVirtualFolderKey(driveId: string, pathPrefix: string): string {
  return `${STORAGE_VIRTUAL_KEY_PREFIX}${driveId}:${encodeURIComponent(pathPrefix)}`;
}

export function parseStorageVirtualFolderKey(key: string): {
  driveId: string;
  pathPrefix: string;
} | null {
  if (!key.startsWith(STORAGE_VIRTUAL_KEY_PREFIX)) return null;
  const rest = key.slice(STORAGE_VIRTUAL_KEY_PREFIX.length);
  const colon = rest.indexOf(":");
  if (colon < 0) return null;
  const driveId = rest.slice(0, colon);
  const encoded = rest.slice(colon + 1);
  try {
    const pathPrefix = decodeURIComponent(encoded);
    if (!driveId || !pathPrefix) return null;
    return { driveId, pathPrefix };
  } catch {
    return null;
  }
}

/** Whether a path prefix (normalized, no leading slashes) is under this storage virtual tree. */
export function backupPathUnderPrefix(relativePath: string, pathPrefix: string): boolean {
  const p = relativePath.replace(/^\/+/, "");
  const pre = pathPrefix.replace(/^\/+/, "");
  return p === pre || p.startsWith(`${pre}/`);
}
