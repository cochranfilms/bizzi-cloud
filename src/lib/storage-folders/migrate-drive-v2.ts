/**
 * One-time migration: enable folder_model_version 2 on a drive and backfill storage_folders
 * + folder_id / file_name / file_name_compare_key on backup_files from relative_path.
 */
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { scopeFromLinkedDrive } from "./drive-scope";
import { buildRelativePathFromFolderNames } from "./path-resolver";
import { trimDisplayName, toNormalizedComparisonKey } from "./normalize";
import { COLLECTION_STORAGE_FOLDERS, FOLDER_MODEL_V2 } from "./types";

const MAX_FILES_TO_MIGRATE = 8_000;

function splitRelativePath(rel: string): { dirParts: string[]; fileName: string } {
  const parts = rel.split("/").filter(Boolean);
  if (parts.length === 0) return { dirParts: [], fileName: "file" };
  const fileName = parts.pop()!;
  return { dirParts: parts, fileName };
}

export async function migrateLinkedDriveToFolderModelV2(
  db: Firestore,
  uid: string,
  linkedDriveId: string,
): Promise<{ foldersCreated: number; filesUpdated: number }> {
  const driveRef = db.collection("linked_drives").doc(linkedDriveId);
  const driveSnap = await driveRef.get();
  if (!driveSnap.exists) throw new Error("Drive not found");
  const driveData = driveSnap.data()!;
  void uid;

  const scope = scopeFromLinkedDrive(linkedDriveId, driveData);
  const now = Timestamp.now();

  const filesSnap = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .limit(MAX_FILES_TO_MIGRATE + 1)
    .get();

  if (filesSnap.size > MAX_FILES_TO_MIGRATE) {
    throw new Error(`Too many files to migrate in one run (>${MAX_FILES_TO_MIGRATE})`);
  }

  /** path key: JSON string of dir segments from root */
  const folderIdByPathKey = new Map<string, string>();

  const uniqueDirChains = new Set<string>();
  for (const d of filesSnap.docs) {
    const rel = String(d.data().relative_path ?? "");
    const { dirParts } = splitRelativePath(rel);
    for (let i = 0; i < dirParts.length; i++) {
      uniqueDirChains.add(JSON.stringify(dirParts.slice(0, i + 1)));
    }
  }

  const sorted = [...uniqueDirChains].sort(
    (a, b) => JSON.parse(a).length - JSON.parse(b).length,
  );

  for (const key of sorted) {
    const dirParts = JSON.parse(key) as string[];
    let parentId: string | null = null;
    if (dirParts.length > 1) {
      parentId = folderIdByPathKey.get(JSON.stringify(dirParts.slice(0, -1))) ?? null;
    }
    if (folderIdByPathKey.has(key)) continue;

    const name = trimDisplayName(dirParts[dirParts.length - 1]);
    const nameKey = toNormalizedComparisonKey(name);
    if (!nameKey) continue;

    let path_ids: string[] = [];
    let path_names: string[] = [];
    let depth = 0;
    if (parentId) {
      const pSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(parentId).get();
      if (pSnap.exists) {
        const p = pSnap.data()!;
        path_ids = [...(p.path_ids as string[]), parentId];
        path_names = [...(p.path_names as string[]), String(p.name)];
        depth = Number(p.depth) + 1;
      }
    }

    const folderRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc();
    await folderRef.set({
      linked_drive_id: linkedDriveId,
      parent_folder_id: parentId,
      node_type: "folder",
      name,
      name_compare_key: nameKey,
      path_ids,
      path_names,
      depth,
      owner_user_id: scope.owner_user_id,
      organization_id: scope.organization_id,
      personal_team_owner_id: scope.personal_team_owner_id,
      drive_type: scope.drive_type,
      lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
      version: 1,
      updated_at: now,
      created_at: now,
      operation_state: "ready",
      operation_job_id: null,
      pending_operation: null,
    });
    folderIdByPathKey.set(key, folderRef.id);
  }

  const foldersCreated = folderIdByPathKey.size;
  let filesUpdated = 0;

  for (const d of filesSnap.docs) {
    const rel = String(d.data().relative_path ?? "");
    const { dirParts, fileName: rawLeaf } = splitRelativePath(rel);
    const fileName = trimDisplayName(rawLeaf) || "file";
    const folderKey = dirParts.length ? JSON.stringify(dirParts) : null;
    const folderId = folderKey ? folderIdByPathKey.get(folderKey) ?? null : null;
    const fKey = toNormalizedComparisonKey(fileName);

    let path_names: string[] = [];
    let path_ids_for_file: string[] = [];
    if (folderId) {
      const fSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId).get();
      if (fSnap.exists) {
        const fd = fSnap.data()!;
        path_names = [...(fd.path_names as string[])];
        path_ids_for_file = [...(fd.path_ids as string[]), folderId];
      }
    }
    const relative_path = buildRelativePathFromFolderNames(path_names, fileName);

    await d.ref.update({
      folder_id: folderId,
      file_name: fileName,
      file_name_compare_key: fKey,
      folder_path_ids: path_ids_for_file,
      relative_path,
    });
    filesUpdated++;
  }

  await driveRef.update({
    folder_model_version: FOLDER_MODEL_V2,
    supports_nested_folders: true,
  });

  return { foldersCreated, filesUpdated };
}
