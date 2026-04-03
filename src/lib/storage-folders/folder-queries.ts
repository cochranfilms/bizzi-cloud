import type { Firestore, Query } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { COLLECTION_STORAGE_FOLDERS } from "./types";

export async function activeFolderNameCollision(
  db: Firestore,
  linkedDriveId: string,
  parentFolderId: string | null,
  nameCompareKey: string,
  excludeFolderId?: string,
): Promise<boolean> {
  const snap = await db
    .collection(COLLECTION_STORAGE_FOLDERS)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("parent_folder_id", "==", parentFolderId)
    .where("name_compare_key", "==", nameCompareKey)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .limit(5)
    .get();
  for (const d of snap.docs) {
    if (excludeFolderId && d.id === excludeFolderId) continue;
    return true;
  }
  return false;
}

export async function activeFileNameCollisionInFolder(
  db: Firestore,
  linkedDriveId: string,
  folderId: string | null,
  fileNameCompareKey: string,
  excludeFileId?: string,
): Promise<boolean> {
  let q: Query = db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .where("file_name_compare_key", "==", fileNameCompareKey)
    .limit(10);

  if (folderId === null) {
    q = q.where("folder_id", "==", null);
  } else {
    q = q.where("folder_id", "==", folderId);
  }

  const snap = await q.get();
  for (const d of snap.docs) {
    if (excludeFileId && d.id === excludeFileId) continue;
    return true;
  }
  return false;
}

export async function activeFolderNameCollidesWithFileInParent(
  db: Firestore,
  linkedDriveId: string,
  parentFolderId: string | null,
  nameCompareKey: string,
): Promise<boolean> {
  return activeFileNameCollisionInFolder(
    db,
    linkedDriveId,
    parentFolderId,
    nameCompareKey,
  );
}

export async function activeFileNameCollidesWithFolderInParent(
  db: Firestore,
  linkedDriveId: string,
  parentFolderId: string | null,
  fileNameCompareKey: string,
): Promise<boolean> {
  return activeFolderNameCollision(
    db,
    linkedDriveId,
    parentFolderId,
    fileNameCompareKey,
  );
}
