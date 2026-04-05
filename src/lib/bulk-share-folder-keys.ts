import { parseStorageVirtualFolderKey } from "@/lib/storage-virtual-folder-key";
import { parseStorageV2FolderPinId } from "@/lib/storage-v2-folder-pin";

const PATH_SUBFOLDER_PREFIX = "path-subfolder-";
const PATH_NESTED_PREFIX = "path-nested-";
const PINNED_V2_PREFIX = "pinned-v2-";

/** Virtual path segment folder inside Storage / Gallery browse (FileGrid). */
export function parsePathSubfolderFolderKey(key: string): {
  driveId: string;
  pathPrefix: string;
} | null {
  if (!key.startsWith(PATH_SUBFOLDER_PREFIX)) return null;
  const rest = key.slice(PATH_SUBFOLDER_PREFIX.length);
  const bar = rest.indexOf("|");
  if (bar < 0) return null;
  const driveId = rest.slice(0, bar);
  const pathPrefix = rest.slice(bar + 1);
  if (!driveId || !pathPrefix) return null;
  return { driveId, pathPrefix };
}

/** Nested virtual path row in FileGrid (`currentPath/segment`). */
export function parsePathNestedFolderKey(key: string): {
  driveId: string;
  pathPrefix: string;
} | null {
  if (!key.startsWith(PATH_NESTED_PREFIX)) return null;
  const rest = key.slice(PATH_NESTED_PREFIX.length);
  const parts = rest.split("|");
  if (parts.length !== 3) return null;
  const [driveId, currentPath, segment] = parts;
  if (!driveId || segment === undefined || segment === "") return null;
  const base = (currentPath ?? "").replace(/^\/+/, "");
  const pathPrefix = base ? `${base}/${segment}` : segment;
  return { driveId, pathPrefix };
}

export type BulkShareFolderBuckets = {
  folderDriveIds: string[];
  storagePathScopes: { driveId: string; pathPrefix: string }[];
  storageV2FolderScopes: { driveId: string; storageFolderId: string }[];
};

/** Turn grid selection folder keys into scopes for `getFileIdsForBulkShare`. */
export function bulkShareArgsFromFolderKeys(folderKeys: string[]): BulkShareFolderBuckets {
  const folderDriveIds: string[] = [];
  const storagePathScopes: { driveId: string; pathPrefix: string }[] = [];
  const storageV2FolderScopes: { driveId: string; storageFolderId: string }[] = [];

  for (const k of folderKeys) {
    const virt = parseStorageVirtualFolderKey(k);
    if (virt) {
      storagePathScopes.push(virt);
      continue;
    }
    if (k.startsWith("drive-")) {
      folderDriveIds.push(k.slice(6));
      continue;
    }
    const pin = parseStorageV2FolderPinId(k);
    if (pin) {
      storageV2FolderScopes.push({
        driveId: pin.linkedDriveId,
        storageFolderId: pin.storageFolderId,
      });
      continue;
    }
    if (k.startsWith(PINNED_V2_PREFIX)) {
      const pinId = k.slice(PINNED_V2_PREFIX.length);
      const p2 = parseStorageV2FolderPinId(pinId);
      if (p2) {
        storageV2FolderScopes.push({
          driveId: p2.linkedDriveId,
          storageFolderId: p2.storageFolderId,
        });
      }
      continue;
    }
    const ps = parsePathSubfolderFolderKey(k);
    if (ps) {
      storagePathScopes.push(ps);
      continue;
    }
    const pn = parsePathNestedFolderKey(k);
    if (pn) {
      storagePathScopes.push(pn);
    }
  }

  return { folderDriveIds, storagePathScopes, storageV2FolderScopes };
}
