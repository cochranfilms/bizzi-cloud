/**
 * Permanently delete a trashed storage_folders subtree: enqueue purge for trashed files, remove folder rows.
 */
import type { Firestore, Query } from "firebase-admin/firestore";
import { enqueuePermanentDeleteJobForBackupFileIds } from "@/lib/backup-files-trash-domain";
import {
  BACKUP_LIFECYCLE_TRASHED,
  resolveBackupFileLifecycleState,
} from "@/lib/backup-file-lifecycle";
import { StorageFolderAccessError, assertFolderModelV2, assertLinkedDriveWriteAccess } from "./linked-drive-access";
import { COLLECTION_STORAGE_FOLDERS } from "./types";

const MAX_EXPANDED_FILES = 12_000;
const FOLDER_DELETE_BATCH = 450;

function driveWideTrashedBackupFileQuery(
  db: Firestore,
  linkedDriveId: string,
  driveData: Record<string, unknown>,
  uid: string
): Query {
  const orgId = (driveData.organization_id as string | undefined) ?? null;
  const teamOwner = (driveData.personal_team_owner_id as string | undefined) ?? null;
  const ownerUid = String(driveData.userId ?? "");
  const driveWide = !!orgId || !!teamOwner || ownerUid === uid;

  let q: FirebaseFirestore.Query = db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED);

  if (orgId) {
    q = q.where("organization_id", "==", orgId);
  } else if (!driveWide) {
    q = q.where("userId", "==", uid);
  }
  return q;
}

export async function permanentlyDeleteStorageFolderSubtree(
  db: Firestore,
  uid: string,
  folderId: string,
  opts?: { expectedVersion?: number }
): Promise<{ filesEnqueued: number; foldersRemoved: number; jobId: string }> {
  const rootRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId);
  const rootSnap = await rootRef.get();
  if (!rootSnap.exists) {
    throw new StorageFolderAccessError("Folder not found", 404);
  }
  const root = rootSnap.data()!;
  if (
    root.system_folder_role === "transfers_root" ||
    root.protected_deletion === true
  ) {
    throw new StorageFolderAccessError("This folder cannot be deleted", 403);
  }
  if (root.lifecycle_state !== BACKUP_LIFECYCLE_TRASHED) {
    throw new StorageFolderAccessError("Folder is not in trash", 400);
  }

  const linkedDriveId = String(root.linked_drive_id ?? "");
  if (!linkedDriveId) {
    throw new StorageFolderAccessError("Invalid folder", 400);
  }

  if (opts?.expectedVersion !== undefined) {
    const v = typeof root.version === "number" ? root.version : Number(root.version ?? NaN);
    if (!Number.isFinite(v) || v !== opts.expectedVersion) {
      throw new StorageFolderAccessError("Folder was changed; refresh and try again", 409);
    }
  }

  const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  await assertFolderModelV2(driveSnap);
  const driveData = driveSnap.data() ?? {};

  const folderIds = new Set<string>([folderId]);
  const depthOf = new Map<string, number>([[folderId, Number(root.depth ?? 0)]]);
  const queue = [folderId];
  while (queue.length) {
    const parent = queue.shift()!;
    const sub = await db
      .collection(COLLECTION_STORAGE_FOLDERS)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("parent_folder_id", "==", parent)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_TRASHED)
      .get();
    for (const d of sub.docs) {
      if (!folderIds.has(d.id)) {
        folderIds.add(d.id);
        depthOf.set(d.id, Number(d.data().depth ?? 0));
        queue.push(d.id);
      }
    }
  }

  const filesSnap = await driveWideTrashedBackupFileQuery(db, linkedDriveId, driveData, uid).get();
  const fileIds: string[] = [];
  for (const d of filesSnap.docs) {
    if (
      resolveBackupFileLifecycleState(d.data() as Record<string, unknown>) !== BACKUP_LIFECYCLE_TRASHED
    ) {
      continue;
    }
    const fid = d.data().folder_id as string | undefined;
    if (fid && folderIds.has(fid)) fileIds.push(d.id);
  }

  const uniqueFiles = [...new Set(fileIds)];
  if (uniqueFiles.length > MAX_EXPANDED_FILES) {
    throw new StorageFolderAccessError(
      `Too many files (${uniqueFiles.length}) in this folder tree. Permanently delete in smaller steps or contact support.`,
      400
    );
  }

  let jobId = "";
  if (uniqueFiles.length > 0) {
    const delResult = await enqueuePermanentDeleteJobForBackupFileIds(db, uid, uniqueFiles, {
      linkedDriveId,
    });
    if (!delResult.ok) {
      throw new StorageFolderAccessError(delResult.err.error, delResult.err.status);
    }
    jobId = delResult.jobId;
  }

  const folderIdList = [...folderIds].sort(
    (a, b) => (depthOf.get(b) ?? 0) - (depthOf.get(a) ?? 0)
  );

  let batch = db.batch();
  let opCount = 0;
  let foldersRemoved = 0;

  for (const id of folderIdList) {
    batch.delete(db.collection(COLLECTION_STORAGE_FOLDERS).doc(id));
    foldersRemoved++;
    opCount++;
    if (opCount >= FOLDER_DELETE_BATCH) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }
  if (opCount > 0) await batch.commit();

  return {
    filesEnqueued: uniqueFiles.length,
    foldersRemoved,
    jobId: jobId || "",
  };
}
