import type { Firestore } from "firebase-admin/firestore";
import { COLLECTION_STORAGE_FOLDERS } from "@/lib/storage-folders/types";

export type ShareFolderRowForPath = {
  path_names: string[];
  name: string;
  linked_drive_id: string;
};

/**
 * Loads storage_folders rows needed to rebuild full display paths for shared v2 files.
 */
export async function loadStorageFolderRowsForSharePaths(
  db: Firestore,
  folderIds: string[],
): Promise<Map<string, ShareFolderRowForPath>> {
  const map = new Map<string, ShareFolderRowForPath>();
  const unique = [...new Set(folderIds.filter((id) => typeof id === "string" && id.length > 0))];
  const chunkSize = 25;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const snaps = await Promise.all(
      chunk.map((id) => db.collection(COLLECTION_STORAGE_FOLDERS).doc(id).get()),
    );
    for (const snap of snaps) {
      if (!snap.exists) continue;
      const data = snap.data()!;
      map.set(snap.id, {
        path_names: Array.isArray(data.path_names) ? (data.path_names as string[]) : [],
        name: String(data.name ?? ""),
        linked_drive_id: String(data.linked_drive_id ?? ""),
      });
    }
  }
  return map;
}

/**
 * Folder model v2 stores `relative_path` as folder.path_names + file_name — omitting the parent
 * folder's own display name. Reconstruct the path the recipient expects using storage_folders.
 */
export function displayPathForSharedBackupFile(
  fileData: Record<string, unknown>,
  folderRowById: Map<string, ShareFolderRowForPath>,
  options: { driveIsFolderModelV2: boolean },
): { path: string; name: string } {
  const relRaw = String(fileData.relative_path ?? "").trim();
  const fileNameRaw = String(fileData.file_name ?? "").trim();
  const legacyLeaf =
    fileNameRaw ||
    (relRaw ? (relRaw.split(/[/\\]+/).filter(Boolean).pop() ?? "") : "") ||
    "?";

  const linkedDriveId = String(fileData.linked_drive_id ?? "");
  const folderIdRaw = fileData.folder_id;
  const folderId =
    typeof folderIdRaw === "string" && folderIdRaw.length > 0 ? folderIdRaw : null;

  if (options.driveIsFolderModelV2 && folderId && folderRowById.has(folderId)) {
    const row = folderRowById.get(folderId)!;
    if (row.linked_drive_id === linkedDriveId) {
      const prefix = [...row.path_names.map((s) => s.trim()).filter(Boolean), row.name.trim()].filter(
        Boolean,
      );
      const path = [...prefix, legacyLeaf].join("/");
      return { path, name: legacyLeaf };
    }
  }

  const path = relRaw || legacyLeaf;
  const name = path.split(/[/\\]+/).filter(Boolean).pop() ?? legacyLeaf;
  return { path, name };
}
