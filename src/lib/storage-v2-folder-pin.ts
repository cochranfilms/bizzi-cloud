/** Pinned folder item id for a Storage v2 `storage_folders` row (not a linked drive). */
const PREFIX = "storage-v2|";

export function buildStorageV2FolderPinId(linkedDriveId: string, storageFolderId: string): string {
  return `${PREFIX}${linkedDriveId}|${storageFolderId}`;
}

export function parseStorageV2FolderPinId(itemId: string): {
  linkedDriveId: string;
  storageFolderId: string;
} | null {
  if (!itemId.startsWith(PREFIX)) return null;
  const rest = itemId.slice(PREFIX.length);
  const bar = rest.indexOf("|");
  if (bar < 0) return null;
  const linkedDriveId = rest.slice(0, bar);
  const storageFolderId = rest.slice(bar + 1);
  if (!linkedDriveId || !storageFolderId) return null;
  return { linkedDriveId, storageFolderId };
}
