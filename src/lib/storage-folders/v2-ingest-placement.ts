import type { Firestore } from "firebase-admin/firestore";
import type { DocumentData } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { StorageFolderAccessError } from "./linked-drive-access";
import {
  activeFileNameCollisionInFolder,
  activeFileNameCollidesWithFolderInParent,
} from "./folder-queries";
import { toNormalizedComparisonKey } from "./normalize";
import { buildRelativePathFromFolderNames } from "./path-resolver";
import { COLLECTION_STORAGE_FOLDERS, FOLDER_MODEL_V2 } from "./types";

export function linkedDriveIsFolderModelV2(data: DocumentData | undefined): boolean {
  return data?.folder_model_version === FOLDER_MODEL_V2;
}

/**
 * For folder model v2 drives: derive folder_id, file_name, compare key, folder_path_ids,
 * and display relative_path from sanitized storage-relative path (may include subpaths — leaf is the file name).
 * Runs name collision checks against existing files/folders in the parent.
 */
export async function resolveV2PlacementForNewUpload(
  db: Firestore,
  driveId: string,
  driveData: DocumentData,
  parentFolderId: string | null,
  safeRelativePath: string,
  options?: { excludeFileId?: string }
): Promise<{
  folder_id: string | null;
  file_name: string;
  file_name_compare_key: string;
  folder_path_ids: string[];
  relative_path: string;
}> {
  if (!linkedDriveIsFolderModelV2(driveData)) {
    throw new Error("resolveV2PlacementForNewUpload called for non-v2 drive");
  }

  let rawParent: string | null = parentFolderId;
  if (rawParent !== null && rawParent.trim() === "") rawParent = null;

  let targetPathNames: string[] = [];
  let folder_path_ids: string[] = [];

  if (rawParent) {
    const fSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(rawParent).get();
    if (!fSnap.exists) {
      throw new StorageFolderAccessError("Target folder not found", 404);
    }
    const f = fSnap.data()!;
    if (f.linked_drive_id !== driveId) {
      throw new StorageFolderAccessError("Folder is not on this drive", 400);
    }
    if (f.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Target folder is not active", 400);
    }
    targetPathNames = [...(f.path_names as string[])];
    folder_path_ids = [...(f.path_ids as string[]), rawParent];
  }

  const parts = safeRelativePath.split("/").filter(Boolean);
  const file_name = parts.length ? parts[parts.length - 1]! : safeRelativePath.trim();
  if (!file_name) {
    throw new StorageFolderAccessError("Invalid file path", 400);
  }

  const file_name_compare_key = toNormalizedComparisonKey(file_name);
  if (!file_name_compare_key) {
    throw new StorageFolderAccessError("Invalid file name", 400);
  }

  if (
    await activeFileNameCollisionInFolder(
      db,
      driveId,
      rawParent,
      file_name_compare_key,
      options?.excludeFileId,
    )
  ) {
    throw new StorageFolderAccessError("A file with this name already exists in the destination", 409);
  }
  if (
    await activeFileNameCollidesWithFolderInParent(
      db,
      driveId,
      rawParent,
      file_name_compare_key,
    )
  ) {
    throw new StorageFolderAccessError("A folder with this name exists in the destination", 409);
  }

  const relative_path = buildRelativePathFromFolderNames(targetPathNames, file_name);

  return {
    folder_id: rawParent,
    file_name,
    file_name_compare_key,
    folder_path_ids,
    relative_path,
  };
}

const MAX_SAME_NAME_QUERY = 8;

/**
 * Re-uploading the same B2 `object_key` updates bytes in place; Firestore must keep a single row.
 * Returns the existing `backup_files` id for excludeFileId + update-after-upload, or null if this is a new name.
 * @throws StorageFolderAccessError 409 if the folder already has an active file with this name on a different key.
 */
export async function findV2SameObjectKeyReplaceTarget(
  db: Firestore,
  driveId: string,
  parentFolderId: string | null,
  safeRelativePath: string,
  objectKey: string
): Promise<string | null> {
  let rawParent: string | null = parentFolderId;
  if (rawParent !== null && rawParent.trim() === "") rawParent = null;

  const parts = safeRelativePath.split("/").filter(Boolean);
  const file_name = parts.length ? parts[parts.length - 1]! : safeRelativePath.trim();
  if (!file_name) return null;
  const file_name_compare_key = toNormalizedComparisonKey(file_name);
  if (!file_name_compare_key) return null;

  let q = db
    .collection("backup_files")
    .where("linked_drive_id", "==", driveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .where("file_name_compare_key", "==", file_name_compare_key)
    .limit(MAX_SAME_NAME_QUERY);

  if (rawParent === null) {
    q = q.where("folder_id", "==", null);
  } else {
    q = q.where("folder_id", "==", rawParent);
  }

  const snap = await q.get();
  if (snap.empty) return null;

  const sameKey = snap.docs.filter((d) => (d.data().object_key as string) === objectKey);
  if (sameKey.length === 1) return sameKey[0]!.id;
  if (sameKey.length > 1) {
    throw new StorageFolderAccessError(
      "Multiple files matched this upload; contact support",
      409
    );
  }

  throw new StorageFolderAccessError(
    "A file with this name already exists in the destination",
    409
  );
}
