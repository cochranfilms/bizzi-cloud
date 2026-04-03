import type { DocumentData, DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { StorageFolderAccessError } from "./linked-drive-access";
import { assertStorageFolderMutationReady } from "./folder-operation-state";
import { COLLECTION_STORAGE_FOLDERS } from "./types";

/**
 * For create / move-into / file targeting: require each folder on the chain from `folderId` to root
 * to be active, same drive, and operation_state ready.
 */
export async function assertDestinationFolderChainReady(
  db: Firestore,
  folderId: string,
  expectedLinkedDriveId: string,
): Promise<void> {
  let currentId: string | null = folderId;
  while (currentId) {
    const id: string = currentId;
    const snap: DocumentSnapshot = await db
      .collection(COLLECTION_STORAGE_FOLDERS)
      .doc(id)
      .get();
    if (!snap.exists) {
      throw new StorageFolderAccessError("Folder not found", 404);
    }
    const d: DocumentData = snap.data()!;
    if (d.linked_drive_id !== expectedLinkedDriveId) {
      throw new StorageFolderAccessError("Folder is not in this drive", 400);
    }
    if (d.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Folder is not active", 400);
    }
    assertStorageFolderMutationReady(d);
    currentId = (d.parent_folder_id as string | null) ?? null;
  }
}

/** Rename / move subtree: only the root folder row must be ready (not whole drive). */
export function assertSubtreeRootReadyForFolderMutation(data: DocumentData): void {
  if (data.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
    throw new StorageFolderAccessError("Folder is not active", 400);
  }
  assertStorageFolderMutationReady(data);
}
