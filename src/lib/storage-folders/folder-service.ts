import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import {
  assertFolderModelV2,
  assertLinkedDriveWriteAccess,
  StorageFolderAccessError,
} from "./linked-drive-access";
import { trimDisplayName, toNormalizedComparisonKey } from "./normalize";
import {
  scopeFromLinkedDrive,
  scopeFromParentFolder,
  scopesMatchForMove,
} from "./drive-scope";
import { buildRelativePathFromFolderNames } from "./path-resolver";
import {
  activeFileNameCollisionInFolder,
  activeFolderNameCollidesWithFileInParent,
  activeFolderNameCollision,
} from "./folder-queries";
import { assertDestinationFolderChainReady, assertSubtreeRootReadyForFolderMutation } from "./folder-chain-guards";
import { assertStorageFolderMutationReady } from "./folder-operation-state";
import {
  collectFolderDescendants,
  computeMovedSubtreeFolderStates,
  countActiveFilesInFolderSubtree,
  recomputeFilesUnderFolderSubtree,
} from "./subtree-sync";
import {
  COLLECTION_STORAGE_FOLDERS,
  SYNC_FOLDER_MOVE_MAX_DESCENDANTS,
  SYNC_FOLDER_MOVE_MAX_FILES,
} from "./types";

function requireCompareKeyOrThrow(displayName: string): string {
  const key = toNormalizedComparisonKey(displayName);
  if (!key) throw new StorageFolderAccessError("Invalid name", 400);
  return key;
}

export async function createStorageFolder(
  db: Firestore,
  uid: string,
  params: {
    linked_drive_id: string;
    parent_folder_id: string | null;
    name: string;
  },
): Promise<{ id: string }> {
  const display = trimDisplayName(params.name);
  const nameCompareKey = requireCompareKeyOrThrow(display);

  const driveRef = db.collection("linked_drives").doc(params.linked_drive_id);
  const driveSnap = await driveRef.get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  await assertFolderModelV2(driveSnap);
  const driveData = driveSnap.data()!;

  let path_ids: string[] = [];
  let path_names: string[] = [];
  let depth = 0;
  let scope = scopeFromLinkedDrive(params.linked_drive_id, driveData);

  if (params.parent_folder_id) {
    await assertDestinationFolderChainReady(
      db,
      params.parent_folder_id,
      params.linked_drive_id,
    );
    const parentRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc(params.parent_folder_id);
    const parentSnap = await parentRef.get();
    if (!parentSnap.exists) {
      throw new StorageFolderAccessError("Parent folder not found", 404);
    }
    const p = parentSnap.data()!;
    if (p.linked_drive_id !== params.linked_drive_id) {
      throw new StorageFolderAccessError("Parent folder is not in this drive", 400);
    }
    if (p.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Parent folder is not active", 400);
    }
    path_ids = [...(p.path_ids as string[]), parentSnap.id];
    path_names = [...(p.path_names as string[]), String(p.name)];
    depth = Number(p.depth) + 1;
    scope = scopeFromParentFolder(p, driveData);
  }

  if (
    await activeFolderNameCollision(
      db,
      params.linked_drive_id,
      params.parent_folder_id,
      nameCompareKey,
    )
  ) {
    throw new StorageFolderAccessError("A folder with this name already exists here", 409);
  }
  if (
    await activeFolderNameCollidesWithFileInParent(
      db,
      params.linked_drive_id,
      params.parent_folder_id,
      nameCompareKey,
    )
  ) {
    throw new StorageFolderAccessError("A file with this name already exists here", 409);
  }

  const folderRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc();
  const now = Timestamp.now();
  await folderRef.set({
    linked_drive_id: params.linked_drive_id,
    parent_folder_id: params.parent_folder_id,
    node_type: "folder",
    name: display,
    name_compare_key: nameCompareKey,
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

  return { id: folderRef.id };
}

export async function listStorageFolderChildren(
  db: Firestore,
  linkedDriveId: string,
  parentFolderId: string | null,
): Promise<{ folders: DocumentData[]; folderIds: string[] }> {
  let q = db
    .collection(COLLECTION_STORAGE_FOLDERS)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .orderBy("name_compare_key");

  if (parentFolderId === null) {
    q = q.where("parent_folder_id", "==", null) as typeof q;
  } else {
    q = q.where("parent_folder_id", "==", parentFolderId) as typeof q;
  }

  const snap = await q.get();
  const folders: DocumentData[] = [];
  const folderIds: string[] = [];
  snap.docs.forEach((d) => {
    folderIds.push(d.id);
    folders.push({ ...d.data(), id: d.id });
  });
  return { folders, folderIds };
}

export async function getStorageFolderAncestors(
  db: Firestore,
  folderId: string,
): Promise<Array<{ id: string; name: string }>> {
  const folderSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId).get();
  if (!folderSnap.exists) return [];
  const data = folderSnap.data()!;
  const ids = data.path_ids as string[];
  const names = data.path_names as string[];
  const out: Array<{ id: string; name: string }> = [];
  for (let i = 0; i < ids.length; i++) {
    out.push({ id: ids[i], name: String(names[i] ?? "") });
  }
  out.push({ id: folderSnap.id, name: String(data.name ?? "") });
  return out;
}

export async function renameStorageFolder(
  db: Firestore,
  uid: string,
  folderId: string,
  newName: string,
  clientVersion: number,
): Promise<void> {
  const display = trimDisplayName(newName);
  const nameCompareKey = requireCompareKeyOrThrow(display);

  const folderRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId);
  const folderSnap = await folderRef.get();
  if (!folderSnap.exists) {
    throw new StorageFolderAccessError("Folder not found", 404);
  }
  const folder = folderSnap.data()!;
  assertSubtreeRootReadyForFolderMutation(folder);
  if (Number(folder.version) !== Number(clientVersion)) {
    throw new StorageFolderAccessError("Folder was modified; refresh and try again", 409);
  }

  const driveSnap = await db.collection("linked_drives").doc(folder.linked_drive_id as string).get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  await assertFolderModelV2(driveSnap);

  const did = folder.linked_drive_id as string;
  const parentId = (folder.parent_folder_id as string | null) ?? null;
  if (
    await activeFolderNameCollision(
      db,
      did,
      parentId,
      nameCompareKey,
      folderId,
    )
  ) {
    throw new StorageFolderAccessError("A folder with this name already exists here", 409);
  }
  if (
    await activeFolderNameCollidesWithFileInParent(
      db,
      did,
      parentId,
      nameCompareKey,
    )
  ) {
    throw new StorageFolderAccessError("A file with this name already exists here", 409);
  }

  const oldNames = folder.path_names as string[];
  const newPathNames = [...oldNames.slice(0, -1), display];

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(folderRef);
    const f = fresh.data()!;
    if (Number(f.version) !== Number(clientVersion)) {
      throw new StorageFolderAccessError("Folder was modified; refresh and try again", 409);
    }
    assertSubtreeRootReadyForFolderMutation(f);
    tx.update(folderRef, {
      name: display,
      name_compare_key: nameCompareKey,
      path_names: newPathNames,
      version: FieldValue.increment(1),
      updated_at: Timestamp.now(),
    });
  });

  const descendants = await collectFolderDescendants(db, folderId);
  if (descendants.length > SYNC_FOLDER_MOVE_MAX_DESCENDANTS) {
    throw new StorageFolderAccessError(
      "Folder tree too large to rename synchronously",
      413,
    );
  }

  let batch = db.batch();
  let ops = 0;
  for (const { ref, data: d } of descendants) {
    const idx = (d.path_ids as string[]).indexOf(folderId);
    if (idx < 0) continue;
    const nextNames = [...(d.path_names as string[])];
    nextNames[idx] = display;
    batch.update(ref, { path_names: nextNames, updated_at: Timestamp.now() });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  const freshRoot = await folderRef.get();
  await recomputeFilesUnderFolderSubtree(db, did, folderId, freshRoot);
}

export async function moveStorageFolder(
  db: Firestore,
  uid: string,
  folderId: string,
  targetParentFolderId: string | null,
  clientVersion: number,
): Promise<void> {
  const folderRef = db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId);
  const folderSnap = await folderRef.get();
  if (!folderSnap.exists) {
    throw new StorageFolderAccessError("Folder not found", 404);
  }
  const folder = folderSnap.data()!;
  const driveId = folder.linked_drive_id as string;
  assertSubtreeRootReadyForFolderMutation(folder);
  if (Number(folder.version) !== Number(clientVersion)) {
    throw new StorageFolderAccessError("Folder was modified; refresh and try again", 409);
  }

  const currentParent = (folder.parent_folder_id as string | null) ?? null;
  const sameParent =
    (currentParent === null && targetParentFolderId === null) ||
    currentParent === targetParentFolderId;
  if (sameParent) {
    throw new StorageFolderAccessError(
      "Those items are already in this folder. You can't move them here again.",
      400,
    );
  }

  if (targetParentFolderId === folderId) {
    throw new StorageFolderAccessError("Cannot move a folder into itself", 400);
  }

  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  await assertFolderModelV2(driveSnap);
  const driveData = driveSnap.data()!;

  let targetParentData: DocumentData | null = null;
  if (targetParentFolderId) {
    const tpSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(targetParentFolderId).get();
    if (!tpSnap.exists) {
      throw new StorageFolderAccessError("Target folder not found", 404);
    }
    targetParentData = tpSnap.data()!;
    if (targetParentData.linked_drive_id !== driveId) {
      throw new StorageFolderAccessError("Cannot move to a folder on another drive", 400);
    }
    if (targetParentData.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Target folder is not active", 400);
    }
    await assertDestinationFolderChainReady(db, targetParentFolderId, driveId);
    const tPathIds = targetParentData.path_ids as string[];
    if (tPathIds.includes(folderId)) {
      throw new StorageFolderAccessError("Cannot move a folder into its descendant", 400);
    }
  }

  let sourceScope;
  if (currentParent) {
    const pSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(currentParent).get();
    if (!pSnap.exists) {
      throw new StorageFolderAccessError("Parent folder not found", 404);
    }
    sourceScope = scopeFromParentFolder(pSnap.data()!, driveData);
  } else {
    sourceScope = scopeFromLinkedDrive(driveId, driveData);
  }

  let destScope;
  if (targetParentFolderId && targetParentData) {
    destScope = scopeFromParentFolder(targetParentData, driveData);
  } else {
    destScope = scopeFromLinkedDrive(driveId, driveData);
  }
  if (!scopesMatchForMove(sourceScope, destScope)) {
    throw new StorageFolderAccessError("Workspace scope mismatch", 400);
  }

  const nameCompareKey = folder.name_compare_key as string;
  if (
    await activeFolderNameCollision(
      db,
      driveId,
      targetParentFolderId,
      nameCompareKey,
      folderId,
    )
  ) {
    throw new StorageFolderAccessError("A folder with this name already exists here", 409);
  }
  if (
    await activeFolderNameCollidesWithFileInParent(
      db,
      driveId,
      targetParentFolderId,
      nameCompareKey,
    )
  ) {
    throw new StorageFolderAccessError("A file with this name already exists here", 409);
  }

  const descendants = await collectFolderDescendants(db, folderId);
  if (descendants.length > SYNC_FOLDER_MOVE_MAX_DESCENDANTS) {
    throw new StorageFolderAccessError(
      "Folder tree too large to move synchronously",
      413,
    );
  }

  const subtreeIds = new Set<string>([folderId, ...descendants.map((d) => d.ref.id)]);
  const fileCount = await countActiveFilesInFolderSubtree(db, driveId, subtreeIds);
  if (fileCount > SYNC_FOLDER_MOVE_MAX_FILES) {
    throw new StorageFolderAccessError(
      "Too many files in this folder tree to move synchronously",
      413,
    );
  }

  const movedRootNewPathIds =
    targetParentFolderId && targetParentData
      ? [...(targetParentData.path_ids as string[]), targetParentFolderId]
      : [];
  const movedRootNewPathNames =
    targetParentFolderId && targetParentData
      ? [...(targetParentData.path_names as string[]), String(targetParentData.name)]
      : [];
  const movedRootNewDepth =
    targetParentFolderId && targetParentData ? Number(targetParentData.depth) + 1 : 0;

  const descendantRows = descendants.map((d) => ({
    id: d.ref.id,
    parent_folder_id: d.data.parent_folder_id as string,
    name: String(d.data.name ?? ""),
  }));

  const computed = computeMovedSubtreeFolderStates({
    movedRootId: folderId,
    movedRootName: String(folder.name ?? ""),
    movedRootNewParentId: targetParentFolderId,
    movedRootNewPathIds,
    movedRootNewPathNames,
    movedRootNewDepth,
    descendantRows,
  });

  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(folderRef);
    const f = fresh.data()!;
    if (Number(f.version) !== Number(clientVersion)) {
      throw new StorageFolderAccessError("Folder was modified; refresh and try again", 409);
    }
    assertSubtreeRootReadyForFolderMutation(f);
    const u = computed.get(folderId)!;
    tx.update(folderRef, {
      parent_folder_id: u.parent_folder_id,
      path_ids: u.path_ids,
      path_names: u.path_names,
      depth: u.depth,
      version: FieldValue.increment(1),
      updated_at: Timestamp.now(),
    });
  });

  let batch = db.batch();
  let ops = 0;
  for (const { ref, data: d } of descendants) {
    const u = computed.get(ref.id);
    if (!u) continue;
    batch.update(ref, {
      path_ids: u.path_ids,
      path_names: u.path_names,
      depth: u.depth,
      updated_at: Timestamp.now(),
    });
    ops++;
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  const freshRoot = await folderRef.get();
  await recomputeFilesUnderFolderSubtree(db, driveId, folderId, freshRoot);
}

export async function moveFileToFolder(
  db: Firestore,
  uid: string,
  params: { file_id: string; target_folder_id: string | null },
): Promise<void> {
  const fileRef = db.collection("backup_files").doc(params.file_id);
  const fileSnap = await fileRef.get();
  if (!fileSnap.exists) {
    throw new StorageFolderAccessError("File not found", 404);
  }
  const file = fileSnap.data()!;

  const driveId = file.linked_drive_id as string;
  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  await assertFolderModelV2(driveSnap);

  const srcFid = (file.folder_id as string | null) ?? null;
  if (srcFid) {
    await assertDestinationFolderChainReady(db, srcFid, driveId);
  }

  const tgtFid = params.target_folder_id ?? null;
  if (srcFid === tgtFid) {
    throw new StorageFolderAccessError(
      "Those items are already in this folder. You can't move them here again.",
      400,
    );
  }

  let targetPathNames: string[] = [];
  let targetPathIds: string[] = [];
  let targetScope = scopeFromLinkedDrive(driveId, driveSnap.data()!);

  if (params.target_folder_id) {
    await assertDestinationFolderChainReady(db, params.target_folder_id, driveId);
    const fSnap = await db
      .collection(COLLECTION_STORAGE_FOLDERS)
      .doc(params.target_folder_id)
      .get();
    if (!fSnap.exists) {
      throw new StorageFolderAccessError("Target folder not found", 404);
    }
    const f = fSnap.data()!;
    if (f.linked_drive_id !== driveId) {
      throw new StorageFolderAccessError("Cannot move to folder on another drive", 400);
    }
    if (f.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Target folder is not active", 400);
    }
    targetPathNames = [...(f.path_names as string[])];
    targetPathIds = [...(f.path_ids as string[]), fSnap.id];
    targetScope = scopeFromParentFolder(f, driveSnap.data()!);
  }

  const fileScope = scopeFromLinkedDrive(driveId, driveSnap.data()!);
  if (!scopesMatchForMove(fileScope, targetScope)) {
    throw new StorageFolderAccessError("Workspace scope mismatch", 400);
  }

  let fileName = String(file.file_name ?? "").trim();
  if (!fileName) {
    const rp = String(file.relative_path ?? "");
    fileName = rp.split("/").filter(Boolean).pop() ?? "file";
  }
  const fileCompareKey = toNormalizedComparisonKey(fileName);
  if (
    await activeFileNameCollisionInFolder(
      db,
      driveId,
      params.target_folder_id,
      fileCompareKey,
      params.file_id,
    )
  ) {
    throw new StorageFolderAccessError("A file with this name already exists in the destination", 409);
  }
  if (
    await activeFolderNameCollision(
      db,
      driveId,
      params.target_folder_id,
      fileCompareKey,
    )
  ) {
    throw new StorageFolderAccessError("A folder with this name exists in the destination", 409);
  }

  const relative_path = buildRelativePathFromFolderNames(targetPathNames, fileName);
  const folder_path_ids = targetPathIds;

  await fileRef.update({
    folder_id: params.target_folder_id,
    file_name: fileName,
    file_name_compare_key: fileCompareKey,
    folder_path_ids,
    relative_path,
  });
}

/**
 * Moves backup files to another linked drive (cross-drive). For v2 targets, sets folder placement;
 * for v1 targets, strips v2 fields. Same-drive moves must use `moveFileToFolder`.
 */
export async function moveBackupFilesToDrive(
  db: Firestore,
  uid: string,
  params: {
    file_ids: string[];
    target_drive_id: string;
    /** Only when target drive is folder model v2 */
    target_folder_id: string | null;
  },
): Promise<void> {
  const { file_ids, target_drive_id, target_folder_id } = params;
  if (file_ids.length === 0) return;

  const targetSnap = await db.collection("linked_drives").doc(target_drive_id).get();
  await assertLinkedDriveWriteAccess(db, uid, targetSnap);
  if (!targetSnap.exists) {
    throw new StorageFolderAccessError("Target drive not found", 404);
  }
  const targetData = targetSnap.data()!;
  const targetV2 = targetData.folder_model_version === 2;
  if (targetV2) {
    await assertFolderModelV2(targetSnap);
  } else if (target_folder_id) {
    throw new StorageFolderAccessError(
      "target_folder_id is only supported for folder model v2 drives",
      400,
    );
  }

  let targetPathNames: string[] = [];
  let targetPathIds: string[] = [];
  let targetScope = scopeFromLinkedDrive(target_drive_id, targetData);
  if (target_folder_id && targetV2) {
    await assertDestinationFolderChainReady(db, target_folder_id, target_drive_id);
    const fSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(target_folder_id).get();
    if (!fSnap.exists) {
      throw new StorageFolderAccessError("Target folder not found", 404);
    }
    const f = fSnap.data()!;
    if (f.linked_drive_id !== target_drive_id) {
      throw new StorageFolderAccessError("Target folder is not on the destination drive", 400);
    }
    if (f.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("Target folder is not active", 400);
    }
    targetPathNames = [...(f.path_names as string[])];
    targetPathIds = [...(f.path_ids as string[]), target_folder_id];
    targetScope = scopeFromParentFolder(f, targetData);
  }

  for (const fileId of file_ids) {
    const fileRef = db.collection("backup_files").doc(fileId);
    const fileSnap = await fileRef.get();
    if (!fileSnap.exists) {
      throw new StorageFolderAccessError(`File not found: ${fileId}`, 404);
    }
    const file = fileSnap.data()!;
    if (file.lifecycle_state !== BACKUP_LIFECYCLE_ACTIVE) {
      throw new StorageFolderAccessError("File is not active", 400);
    }
    const sourceDriveId = file.linked_drive_id as string;
    if (sourceDriveId === target_drive_id) {
      throw new StorageFolderAccessError(
        "Those items are already in this folder. You can't move them here again.",
        400,
      );
    }

    const sourceSnap = await db.collection("linked_drives").doc(sourceDriveId).get();
    await assertLinkedDriveWriteAccess(db, uid, sourceSnap);
    const fileScope = scopeFromLinkedDrive(sourceDriveId, sourceSnap.data()!);
    if (!scopesMatchForMove(fileScope, targetScope)) {
      throw new StorageFolderAccessError("Workspace scope mismatch", 400);
    }

    let fileName = String(file.file_name ?? "").trim();
    if (!fileName) {
      const rp = String(file.relative_path ?? "");
      fileName = rp.split("/").filter(Boolean).pop() ?? "file";
    }
    const fileCompareKey = toNormalizedComparisonKey(fileName);

    if (targetV2) {
      if (
        await activeFileNameCollisionInFolder(
          db,
          target_drive_id,
          target_folder_id,
          fileCompareKey,
          fileId,
        )
      ) {
        throw new StorageFolderAccessError(
          "A file with this name already exists in the destination",
          409,
        );
      }
      if (
        await activeFolderNameCollision(
          db,
          target_drive_id,
          target_folder_id,
          fileCompareKey,
        )
      ) {
        throw new StorageFolderAccessError(
          "A folder with this name exists in the destination",
          409,
        );
      }
      const relative_path = buildRelativePathFromFolderNames(targetPathNames, fileName);
      await fileRef.update({
        linked_drive_id: target_drive_id,
        folder_id: target_folder_id,
        file_name: fileName,
        file_name_compare_key: fileCompareKey,
        folder_path_ids: targetPathIds,
        relative_path,
      });
    } else {
      await fileRef.update({
        linked_drive_id: target_drive_id,
        relative_path: fileName,
        folder_id: null,
        file_name: FieldValue.delete(),
        file_name_compare_key: FieldValue.delete(),
        folder_path_ids: FieldValue.delete(),
      });
    }
  }
}
