/**
 * Transfer packages live under Storage/Transfers/{transfer title}/ with optional reference
 * backup_files rows (same object_key) for files picked from elsewhere, mirroring Gallery Media links.
 */
import type { DocumentData, DocumentReference, Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { ensureGalleryMediaDriveFolderModelV2 } from "@/lib/gallery-link-assets-to-media-folder";
import {
  createStorageFolder,
  listStorageFolderChildren,
  migrateLinkedDriveToFolderModelV2,
  resolveV2PlacementForNewUpload,
  scopeFromLinkedDrive,
  linkedDriveIsFolderModelV2,
  COLLECTION_STORAGE_FOLDERS,
} from "@/lib/storage-folders";
import { trimDisplayName, toNormalizedComparisonKey } from "@/lib/storage-folders/normalize";
import { buildRelativePathFromFolderNames } from "@/lib/storage-folders/path-resolver";
import { StorageFolderAccessError } from "@/lib/storage-folders/linked-drive-access";

const TRANSFERS_SEGMENT = "Transfers";
const MAX_LINKED_PATH_DEPTH = 64;

export { StorageFolderAccessError };

function safeDirPartsFromSourceRelativePath(relativePath: string): string[] {
  const parts = String(relativePath ?? "")
    .replace(/^\/+/, "")
    .split("/")
    .filter(Boolean);
  if (parts.length <= 1) return [];
  const dirs = parts.slice(0, -1);
  const out: string[] = [];
  for (const d of dirs) {
    const t = trimDisplayName(d);
    if (!t || t === "." || t === "..") continue;
    out.push(t);
    if (out.length >= MAX_LINKED_PATH_DEPTH) break;
  }
  return out;
}

async function ensureFolderChainUnderParent(
  db: Firestore,
  actingUid: string,
  linkedDriveId: string,
  startParentFolderId: string,
  relativeFolderNames: string[]
): Promise<string> {
  let parentId = startParentFolderId;
  for (const raw of relativeFolderNames) {
    const display = trimDisplayName(raw);
    if (!display) continue;
    const wantKey = toNormalizedComparisonKey(display);
    if (!wantKey) continue;
    const { folders } = await listStorageFolderChildren(db, linkedDriveId, parentId);
    const found = folders.find(
      (f) =>
        toNormalizedComparisonKey(trimDisplayName(String((f as { name?: string }).name ?? ""))) ===
        wantKey
    );
    const fid = (found as { id?: string } | undefined)?.id;
    if (fid) {
      parentId = fid;
      continue;
    }
    const { id } = await createStorageFolder(db, actingUid, {
      linked_drive_id: linkedDriveId,
      parent_folder_id: parentId,
      name: display,
    });
    parentId = id;
  }
  return parentId;
}

export async function resolveUserPrimaryStorageDriveFromTransfer(
  db: Firestore,
  uid: string,
  transferData: Record<string, unknown>
): Promise<{ id: string; data: DocumentData } | null> {
  const orgId =
    typeof transferData.organization_id === "string" && transferData.organization_id.trim()
      ? transferData.organization_id.trim()
      : null;
  const pto =
    typeof transferData.personal_team_owner_id === "string" &&
    transferData.personal_team_owner_id.trim()
      ? transferData.personal_team_owner_id.trim()
      : null;

  const snap = await db.collection("linked_drives").where("userId", "==", uid).get();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.is_org_shared === true) continue;
    const name = String(data.name ?? "");
    if (name !== "Storage" && name !== "Uploads") continue;
    const oid = (data.organization_id as string | undefined) ?? null;
    const rowPto = (data.personal_team_owner_id as string | undefined) ?? null;
    if (orgId) {
      if (oid === orgId) return { id: d.id, data };
    } else if (pto) {
      if (!oid && rowPto === pto) return { id: d.id, data };
    } else if (!oid && !rowPto) {
      return { id: d.id, data };
    }
  }
  return null;
}

async function ensureStorageDriveFolderModelV2(
  db: Firestore,
  uid: string,
  driveId: string,
  driveData: DocumentData
): Promise<DocumentData> {
  if (linkedDriveIsFolderModelV2(driveData)) {
    return driveData;
  }
  await migrateLinkedDriveToFolderModelV2(db, uid, driveId);
  const fresh = await db.collection("linked_drives").doc(driveId).get();
  return fresh.data() ?? driveData;
}

async function findRootChildFolderId(
  db: Firestore,
  driveId: string,
  displayName: string
): Promise<string | undefined> {
  const key = toNormalizedComparisonKey(trimDisplayName(displayName));
  if (!key) return undefined;
  const { folders } = await listStorageFolderChildren(db, driveId, null);
  const found = folders.find(
    (f) => toNormalizedComparisonKey(trimDisplayName(String((f as { name?: string }).name ?? ""))) === key
  );
  return (found as { id?: string } | undefined)?.id;
}

async function ensureTransfersRootFolderId(
  db: Firestore,
  uid: string,
  driveId: string
): Promise<string> {
  const existing = await findRootChildFolderId(db, driveId, TRANSFERS_SEGMENT);
  if (existing) {
    const ref = db.collection(COLLECTION_STORAGE_FOLDERS).doc(existing);
    const snap = await ref.get();
    if (snap.exists) {
      const d = snap.data()!;
      if (!d.system_folder_role) {
        await ref.update({
          protected_deletion: true,
          system_folder_role: "transfers_root",
          updated_at: Timestamp.now(),
        });
      }
    }
    return existing;
  }
  const { id } = await createStorageFolder(db, uid, {
    linked_drive_id: driveId,
    parent_folder_id: null,
    name: TRANSFERS_SEGMENT,
  });
  await db.collection(COLLECTION_STORAGE_FOLDERS).doc(id).update({
    protected_deletion: true,
    system_folder_role: "transfers_root",
    updated_at: Timestamp.now(),
  });
  return id;
}

/**
 * Finds or creates the per-transfer folder under Transfers/, keyed by transfer slug to avoid collisions.
 */
export async function ensureTransferPackageFolderId(
  db: Firestore,
  uid: string,
  transferSlug: string,
  transferTitle: string,
  storageDriveId: string,
  transfersRootFolderId: string
): Promise<string> {
  const { folders } = await listStorageFolderChildren(db, storageDriveId, transfersRootFolderId);
  const bySlug = folders.find(
    (f) => String((f as { transfer_package_slug?: string }).transfer_package_slug ?? "") === transferSlug
  );
  if ((bySlug as { id?: string } | undefined)?.id) {
    return (bySlug as { id: string }).id;
  }

  const baseTitle = trimDisplayName(transferTitle) || "Transfer";
  const wantKey = toNormalizedComparisonKey(baseTitle);
  if (!wantKey) {
    throw new StorageFolderAccessError("Invalid transfer title for storage folder", 400);
  }

  const sameNameOther = folders.find(
    (f) =>
      toNormalizedComparisonKey(trimDisplayName(String((f as { name?: string }).name ?? ""))) ===
        wantKey && String((f as { transfer_package_slug?: string }).transfer_package_slug ?? "") !== transferSlug
  );
  const folderDisplayName = sameNameOther
    ? `${baseTitle} (${transferSlug})`
    : baseTitle;

  const { id } = await createStorageFolder(db, uid, {
    linked_drive_id: storageDriveId,
    parent_folder_id: transfersRootFolderId,
    name: folderDisplayName,
  });
  await db.collection(COLLECTION_STORAGE_FOLDERS).doc(id).update({
    transfer_package_slug: transferSlug,
    updated_at: Timestamp.now(),
  });
  return id;
}

export async function getOrCreateTransferStoragePackageFolderId(
  db: Firestore,
  uid: string,
  transferRef: DocumentReference,
  transferData: Record<string, unknown>,
  transferSlug: string
): Promise<{
  storageDriveId: string;
  packageFolderId: string;
}> {
  const cached = transferData.transfer_storage_package_folder_id as string | undefined;
  if (cached && typeof cached === "string" && cached.trim()) {
    const fsnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(cached.trim()).get();
    if (fsnap.exists && fsnap.data()?.lifecycle_state === BACKUP_LIFECYCLE_ACTIVE) {
      const drive = await resolveUserPrimaryStorageDriveFromTransfer(db, uid, transferData);
      if (drive && fsnap.data()?.linked_drive_id === drive.id) {
        return { storageDriveId: drive.id, packageFolderId: cached.trim() };
      }
    }
  }

  const drive = await resolveUserPrimaryStorageDriveFromTransfer(db, uid, transferData);
  if (!drive) {
    throw new StorageFolderAccessError("Storage drive not found", 404);
  }

  const title = String(transferData.name ?? "").trim() || "Transfer";
  let driveData = await ensureStorageDriveFolderModelV2(db, uid, drive.id, drive.data);
  const upgraded = await ensureGalleryMediaDriveFolderModelV2(db, uid, drive.id);
  if (!upgraded) {
    throw new StorageFolderAccessError("Storage drive must use folder model", 400);
  }
  const driveSnap = await db.collection("linked_drives").doc(drive.id).get();
  driveData = driveSnap.data() ?? driveData;

  const transfersRootId = await ensureTransfersRootFolderId(db, uid, drive.id);
  const packageFolderId = await ensureTransferPackageFolderId(
    db,
    uid,
    transferSlug,
    title,
    drive.id,
    transfersRootId
  );

  await transferRef.update({
    transfer_storage_package_folder_id: packageFolderId,
    updated_at: new Date().toISOString(),
  });

  return { storageDriveId: drive.id, packageFolderId };
}

export async function folderIsWithinTransferPackage(
  db: Firestore,
  fileFolderId: string | null,
  packageFolderId: string
): Promise<boolean> {
  if (!fileFolderId) return false;
  if (fileFolderId === packageFolderId) return true;
  const snap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(fileFolderId).get();
  if (!snap.exists) return false;
  const ids = snap.data()!.path_ids as string[];
  return Array.isArray(ids) && ids.includes(packageFolderId);
}

async function findReferenceRowInPackage(
  db: Firestore,
  storageDriveId: string,
  packageFolderId: string,
  sourceId: string
): Promise<string | null> {
  const q = await db
    .collection("backup_files")
    .where("reference_source_backup_file_id", "==", sourceId)
    .where("linked_drive_id", "==", storageDriveId)
    .limit(40)
    .get();

  for (const d of q.docs) {
    const fid = d.data().folder_id as string | null;
    if (fid && (await folderIsWithinTransferPackage(db, fid, packageFolderId))) {
      return d.id;
    }
  }
  return null;
}

/**
 * If the file already lives under the transfer package folder tree, return its id.
 * Otherwise create a reference backup_files row (no B2 copy) and return the new id.
 */
export async function resolveBackupFileIdForTransferAttachment(
  db: Firestore,
  uid: string,
  transferRef: DocumentReference,
  transferData: Record<string, unknown>,
  transferSlug: string,
  sourceBackupFileId: string
): Promise<{
  backupFileId: string;
  objectKey: string | null;
  displayPath: string;
  name: string;
}> {
  const srcSnap = await db.collection("backup_files").doc(sourceBackupFileId).get();
  if (!srcSnap.exists) {
    throw new StorageFolderAccessError("Source file not found", 404);
  }
  const src = srcSnap.data()!;
  const { storageDriveId, packageFolderId } = await getOrCreateTransferStoragePackageFolderId(
    db,
    uid,
    transferRef,
    transferData,
    transferSlug
  );

  const driveSnap = await db.collection("linked_drives").doc(storageDriveId).get();
  const driveData = driveSnap.data()!;
  const driveName = String(driveData.name ?? "Storage");

  const srcFolderId = (src.folder_id as string | null) ?? null;
  if (await folderIsWithinTransferPackage(db, srcFolderId, packageFolderId)) {
    const path = `${driveName}/${String(src.relative_path ?? "")}`.replace(/\/+/g, "/");
    return {
      backupFileId: sourceBackupFileId,
      objectKey: (src.object_key as string | null) ?? null,
      displayPath: path,
      name:
        String(src.file_name ?? "").trim() ||
        String(src.relative_path ?? "").split("/").filter(Boolean).pop() ||
        "file",
    };
  }

  const existingRef = await findReferenceRowInPackage(
    db,
    storageDriveId,
    packageFolderId,
    sourceBackupFileId
  );
  if (existingRef) {
    const row = (await db.collection("backup_files").doc(existingRef).get()).data()!;
    const path = `${driveName}/${String(row.relative_path ?? "")}`.replace(/\/+/g, "/");
    return {
      backupFileId: existingRef,
      objectKey: (row.object_key as string | null) ?? null,
      displayPath: path,
      name:
        String(row.file_name ?? "").trim() ||
        String(row.relative_path ?? "").split("/").filter(Boolean).pop() ||
        "file",
    };
  }

  const objectKey = String(src.object_key ?? "").trim();
  if (!objectKey) {
    throw new StorageFolderAccessError("Source file has no object key", 400);
  }

  const pathRaw = String(src.relative_path ?? "");
  const fileName =
    String(src.file_name ?? "").trim() || pathRaw.split("/").filter(Boolean).pop() || "file";
  const dirParts = safeDirPartsFromSourceRelativePath(pathRaw);
  const leafFolderId = await ensureFolderChainUnderParent(
    db,
    uid,
    storageDriveId,
    packageFolderId,
    dirParts
  );
  const lfSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(leafFolderId).get();
  if (!lfSnap.exists) {
    throw new StorageFolderAccessError("Folder chain failed", 500);
  }
  const lf = lfSnap.data()!;
  const folderNames = [...(lf.path_names as string[]), String(lf.name ?? "")];
  const relative_path = buildRelativePathFromFolderNames(folderNames, fileName);

  const compareKey = toNormalizedComparisonKey(fileName);
  if (!compareKey) {
    throw new StorageFolderAccessError("Invalid file name", 400);
  }

  const scope = scopeFromLinkedDrive(storageDriveId, driveData);
  const nowIso = new Date().toISOString();
  const snapshotRef = await db.collection("backup_snapshots").add({
    linked_drive_id: storageDriveId,
    userId: uid,
    status: "completed",
    files_count: 1,
    bytes_synced: Number(src.size_bytes ?? 0),
    completed_at: new Date(),
  });

  const row: Record<string, unknown> = {
    backup_snapshot_id: snapshotRef.id,
    linked_drive_id: storageDriveId,
    folder_id: leafFolderId,
    userId: uid,
    relative_path,
    file_name: fileName,
    file_name_compare_key: compareKey,
    reference_source_backup_file_id: sourceBackupFileId,
    object_key: objectKey,
    size_bytes: Number(src.size_bytes ?? 0),
    content_type:
      typeof src.content_type === "string" ? src.content_type : "application/octet-stream",
    modified_at: (src.modified_at as string) || nowIso,
    uploaded_at: nowIso,
    deleted_at: null,
    lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
    ingest_state: "ready",
    organization_id: src.organization_id ?? scope.organization_id ?? null,
    workspace_id: src.workspace_id ?? null,
    visibility_scope: src.visibility_scope ?? null,
    owner_user_id: src.owner_user_id ?? uid,
    personal_team_owner_id: src.personal_team_owner_id ?? scope.personal_team_owner_id ?? null,
    proxy_status: (src.proxy_status as string | null | undefined) ?? null,
  };

  const docRef = await db.collection("backup_files").add(row);
  const displayPath = `${driveName}/${relative_path}`.replace(/\/+/g, "/");
  return {
    backupFileId: docRef.id,
    objectKey,
    displayPath,
    name: fileName,
  };
}

/**
 * V2 placement for a new binary upload into the transfer package folder.
 */
export async function resolveTransferModalUploadPlacement(
  db: Firestore,
  uid: string,
  transferRef: DocumentReference,
  transferData: Record<string, unknown>,
  transferSlug: string,
  relativePathFromUpload: string
): Promise<{
  linked_drive_id: string;
  folder_id: string | null;
  file_name: string;
  file_name_compare_key: string;
  folder_path_ids: string[];
  relative_path: string;
}> {
  const safe = String(relativePathFromUpload ?? "")
    .replace(/^\/+/, "")
    .replace(/\.\.(\/|\\|$)/g, "")
    .trim();
  if (!safe) {
    throw new StorageFolderAccessError("relative_path is required", 400);
  }

  const { storageDriveId, packageFolderId } = await getOrCreateTransferStoragePackageFolderId(
    db,
    uid,
    transferRef,
    transferData,
    transferSlug
  );

  const driveSnap = await db.collection("linked_drives").doc(storageDriveId).get();
  let driveData = driveSnap.data()!;
  driveData = await ensureStorageDriveFolderModelV2(db, uid, storageDriveId, driveData);
  const upgraded = await ensureGalleryMediaDriveFolderModelV2(db, uid, storageDriveId);
  if (!upgraded) {
    throw new StorageFolderAccessError("Storage drive must use folder model", 400);
  }
  const fresh = await db.collection("linked_drives").doc(storageDriveId).get();
  driveData = fresh.data()!;

  const parts = safe.split("/").filter(Boolean);
  const fileLeaf = parts.length ? parts[parts.length - 1]! : safe;
  const dirParts = parts.length > 1 ? parts.slice(0, -1) : [];
  const parentForFile = await ensureFolderChainUnderParent(
    db,
    uid,
    storageDriveId,
    packageFolderId,
    dirParts
  );

  const placement = await resolveV2PlacementForNewUpload(
    db,
    storageDriveId,
    driveData,
    parentForFile,
    fileLeaf
  );
  return { linked_drive_id: storageDriveId, ...placement };
}
