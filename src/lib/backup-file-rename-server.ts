/**
 * Server-side backup file rename: keeps Firestore paths and B2 object_key in sync for
 * path-keyed objects (backups/...). Content-addressed content/... keys only get metadata updates.
 */
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { buildBackupObjectKey, sanitizeBackupRelativePath } from "@/lib/backup-object-key";
import {
  copyObjectServerSide,
  deleteObject,
  getLutBakedObjectKey,
  getProxyObjectKey,
  isB2Configured,
  objectExists,
} from "@/lib/b2";
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { BACKUP_LIFECYCLE_ACTIVE, isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { creativeFirestoreFieldsFromRelativePath } from "@/lib/creative-file-registry";
import {
  activeFileNameCollisionInFolder,
  activeFileNameCollidesWithFolderInParent,
} from "@/lib/storage-folders/folder-queries";
import {
  assertLinkedDriveWriteAccess,
  StorageFolderAccessError,
} from "@/lib/storage-folders/linked-drive-access";
import { trimDisplayName, toNormalizedComparisonKey } from "@/lib/storage-folders/normalize";
import { buildRelativePathFromFolderNames } from "@/lib/storage-folders/path-resolver";
import { COLLECTION_STORAGE_FOLDERS, FOLDER_MODEL_V2 } from "@/lib/storage-folders/types";

function parseBackupsLayoutKey(objectKey: string): {
  pathSubjectUid: string;
  driveId: string;
  relativePath: string;
} | null {
  const prefix = "backups/";
  if (!objectKey.startsWith(prefix)) return null;
  const rest = objectKey.slice(prefix.length);
  const i1 = rest.indexOf("/");
  if (i1 <= 0) return null;
  const i2 = rest.indexOf("/", i1 + 1);
  if (i2 <= i1 + 1) return null;
  const pathSubjectUid = rest.slice(0, i1);
  const driveId = rest.slice(i1 + 1, i2);
  const relativePath = rest.slice(i2 + 1);
  return { pathSubjectUid, driveId, relativePath };
}

export async function renameBackupFileServer(
  db: Firestore,
  uid: string,
  backupFileId: string,
  newNameRaw: string,
): Promise<void> {
  const leaf = trimDisplayName(newNameRaw);
  if (!leaf) {
    throw new StorageFolderAccessError("Name cannot be empty", 400);
  }
  if (/[/\\]/.test(leaf) || leaf.includes("..")) {
    throw new StorageFolderAccessError("File name cannot contain path characters", 400);
  }
  const fileNameCompareKey = toNormalizedComparisonKey(leaf);
  if (!fileNameCompareKey) {
    throw new StorageFolderAccessError("Invalid file name", 400);
  }

  const fileRef = db.collection("backup_files").doc(backupFileId);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    throw new StorageFolderAccessError("File not found", 404);
  }
  const file = fileSnap.data()!;
  if (!isBackupFileActiveForListing(file as Record<string, unknown>)) {
    throw new StorageFolderAccessError("File is not active", 400);
  }

  const objectKey = file.object_key as string | undefined;
  if (!objectKey || typeof objectKey !== "string") {
    throw new StorageFolderAccessError("Invalid file", 400);
  }

  const allowed = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  if (!allowed) {
    throw new StorageFolderAccessError("Access denied", 403);
  }

  const driveId = file.linked_drive_id as string;
  if (!driveId) {
    throw new StorageFolderAccessError("Invalid file", 400);
  }
  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  const driveData = driveSnap.data()!;
  const isV2 = driveData.folder_model_version === FOLDER_MODEL_V2;

  const folderIdRaw = file.folder_id as string | null | undefined;
  const folderId =
    folderIdRaw === undefined || folderIdRaw === null || String(folderIdRaw).trim() === ""
      ? null
      : String(folderIdRaw).trim();

  let newRelativePath: string;

  if (isV2) {
    let parentPathNames: string[] = [];
    if (folderId) {
      const fSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId).get();
      if (!fSnap.exists) {
        throw new StorageFolderAccessError("Folder not found", 404);
      }
      const f = fSnap.data()!;
      if (f.linked_drive_id !== driveId) {
        throw new StorageFolderAccessError("Folder is not on this drive", 400);
      }
      if (f.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
        throw new StorageFolderAccessError("Folder is not active", 400);
      }
      parentPathNames = [...((f.path_names as string[]) ?? [])];
    }
    newRelativePath = sanitizeBackupRelativePath(
      buildRelativePathFromFolderNames(parentPathNames, leaf),
    );

    if (
      await activeFileNameCollisionInFolder(db, driveId, folderId, fileNameCompareKey, backupFileId)
    ) {
      throw new StorageFolderAccessError("A file with this name already exists in this folder", 409);
    }
    if (await activeFileNameCollidesWithFolderInParent(db, driveId, folderId, fileNameCompareKey)) {
      throw new StorageFolderAccessError("A folder with this name exists in this location", 409);
    }
  } else {
    const oldRel = sanitizeBackupRelativePath(String(file.relative_path ?? ""));
    const parts = oldRel.split("/").filter(Boolean);
    newRelativePath =
      parts.length > 0 ? [...parts.slice(0, -1), leaf].join("/") : leaf;
    newRelativePath = sanitizeBackupRelativePath(newRelativePath);
  }

  const prevRel = sanitizeBackupRelativePath(String(file.relative_path ?? ""));
  const prevLeaf =
    String(file.file_name ?? "").trim() ||
    prevRel.split("/").filter(Boolean).pop() ||
    "";
  if (
    toNormalizedComparisonKey(prevLeaf) === fileNameCompareKey &&
    prevRel === newRelativePath
  ) {
    return;
  }

  const parsed = parseBackupsLayoutKey(objectKey);
  const oldMainKey = objectKey;
  let newMainKey = objectKey;

  if (parsed) {
    if (parsed.driveId !== driveId) {
      throw new StorageFolderAccessError("Drive mismatch for this file", 400);
    }
    newMainKey = buildBackupObjectKey({
      pathSubjectUid: parsed.pathSubjectUid,
      driveId,
      relativePath: newRelativePath,
      contentHash: null,
    });
  }

  let copiedProxy = false;

  if (parsed && newMainKey !== oldMainKey) {
    if (!isB2Configured()) {
      throw new StorageFolderAccessError("Storage is not configured", 503);
    }
    if (await objectExists(newMainKey)) {
      throw new StorageFolderAccessError("A file already exists at the destination path", 409);
    }
    await copyObjectServerSide(oldMainKey, newMainKey);

    const oldProxyEffective =
      (file.proxy_object_key as string | undefined)?.trim() || getProxyObjectKey(oldMainKey);
    const newProxyEffective = getProxyObjectKey(newMainKey);
    if (await objectExists(oldProxyEffective)) {
      if (await objectExists(newProxyEffective)) {
        throw new StorageFolderAccessError("Proxy collision at destination", 409);
      }
      await copyObjectServerSide(oldProxyEffective, newProxyEffective);
      copiedProxy = true;
    }

    const oldLut = getLutBakedObjectKey(oldMainKey);
    const newLut = getLutBakedObjectKey(newMainKey);
    if ((await objectExists(oldLut)) && !(await objectExists(newLut))) {
      await copyObjectServerSide(oldLut, newLut);
    }
  }

  const updatePayload: Record<string, unknown> = {
    relative_path: newRelativePath,
    file_name: leaf,
    file_name_compare_key: fileNameCompareKey,
    ...macosPackageFirestoreFieldsFromRelativePath(newRelativePath),
    ...creativeFirestoreFieldsFromRelativePath(newRelativePath),
  };

  if (newMainKey !== oldMainKey) {
    updatePayload.object_key = newMainKey;
    const newProxyKey = getProxyObjectKey(newMainKey);
    if (copiedProxy || (await objectExists(newProxyKey))) {
      updatePayload.proxy_object_key = newProxyKey;
    } else {
      updatePayload.proxy_object_key = FieldValue.delete();
    }
  }

  await fileRef.update(updatePayload);

  if (parsed && newMainKey !== oldMainKey) {
    await deleteObject(oldMainKey).catch(() => {});
    const oldProxyEffective =
      (file.proxy_object_key as string | undefined)?.trim() || getProxyObjectKey(oldMainKey);
    await deleteObject(oldProxyEffective).catch(() => {});
    await deleteObject(getLutBakedObjectKey(oldMainKey)).catch(() => {});
  }
}
