/**
 * Shared trash / restore domain for backup_files (web first; mount gated on policy doc).
 */
import type { Firestore } from "firebase-admin/firestore";
import { assertCanTrashBackupFile, assertMayRemoveBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { FieldValue } from "firebase-admin/firestore";
import {
  applyMacosPackageDelta,
  mergeMacosPackageTrashDeltasInto,
  packageStatDeltaFromFileData,
  reconcileMacosPackageMembershipForBackupFile,
} from "@/lib/macos-package-container-admin";
import { expandTrashInputIdsWithMacosPackages } from "@/lib/macos-package-trash-expand";
import {
  BACKUP_LIFECYCLE_ACTIVE,
  BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
  BACKUP_LIFECYCLE_TRASHED,
  isBackupFileActiveForListing,
  resolveBackupFileLifecycleState,
} from "@/lib/backup-file-lifecycle";
import type { BackupFileMutationSource } from "@/lib/backup-file-mutation-source";
import { logBackupFilesTrashAudit } from "@/lib/backup-files-trash-audit";

const UPDATE_BATCH = 450;

export type TrashDomainError = { error: string; status: 400 | 403 | 404 };

export type MoveToTrashResult =
  | { ok: true; expandedFileCount: number }
  | { ok: false; err: TrashDomainError };

export type RestoreFromTrashResult =
  | { ok: true; restoredCount: number }
  | { ok: false; err: TrashDomainError };

async function assertAllCanTrash(actorUid: string, fileIds: string[]): Promise<TrashDomainError | null> {
  for (const id of fileIds) {
    try {
      await assertCanTrashBackupFile(actorUid, id);
    } catch (e) {
      if (e instanceof TrashForbiddenError) {
        return { error: e.message, status: 403 };
      }
      throw e;
    }
  }
  return null;
}

/**
 * Web/API trash: expand macos-pkg:* IDs, enforce policy, dual-write deleted_at + lifecycle_state.
 */
export async function moveBackupFilesToTrashFromWebInput(
  db: Firestore,
  actorUid: string,
  inputIds: string[],
  opts: { source: BackupFileMutationSource; maxInputIds: number; maxExpandedIds: number }
): Promise<MoveToTrashResult> {
  const { source, maxInputIds, maxExpandedIds } = opts;
  if (inputIds.length === 0) {
    return { ok: false, err: { error: "file_ids required", status: 400 } };
  }
  if (inputIds.length > maxInputIds) {
    return { ok: false, err: { error: `Max ${maxInputIds} files per request`, status: 400 } };
  }

  const expandedResult = await expandTrashInputIdsWithMacosPackages(db, inputIds);
  if (!expandedResult.ok) {
    return { ok: false, err: { error: expandedResult.error, status: 400 } };
  }
  const fileIds = expandedResult.expanded;
  if (fileIds.length === 0) {
    return { ok: false, err: { error: "No files to delete", status: 400 } };
  }
  if (fileIds.length > maxExpandedIds) {
    return {
      ok: false,
      err: {
        error: `Too many files (${fileIds.length}). Delete large packages from the drive view in smaller steps or contact support.`,
        status: 400,
      },
    };
  }

  const policyErr = await assertAllCanTrash(actorUid, fileIds);
  if (policyErr) {
    return { ok: false, err: policyErr };
  }

  const snapshots = await Promise.all(fileIds.map((id) => db.collection("backup_files").doc(id).get()));
  const pkgDeltas = new Map<string, { count: number; bytes: number }>();
  for (let i = 0; i < fileIds.length; i++) {
    const snap = snapshots[i];
    if (!snap.exists) continue;
    const d = snap.data()!;
    if (!isBackupFileActiveForListing(d as Record<string, unknown>)) continue;
    mergeMacosPackageTrashDeltasInto(pkgDeltas, d);
  }

  for (let i = 0; i < fileIds.length; i += UPDATE_BATCH) {
    const batch = db.batch();
    for (const id of fileIds.slice(i, i + UPDATE_BATCH)) {
      batch.update(db.collection("backup_files").doc(id), {
        deleted_at: FieldValue.serverTimestamp(),
        lifecycle_state: BACKUP_LIFECYCLE_TRASHED,
      });
    }
    await batch.commit();
  }

  const negDeltas = new Map<string, { count: number; bytes: number }>();
  for (const [pid, { count, bytes }] of pkgDeltas) {
    negDeltas.set(pid, { count, bytes });
  }
  if (negDeltas.size > 0) {
    await applyMacosPackageDelta(db, negDeltas);
  }

  await logBackupFilesTrashAudit({
    actorUserId: actorUid,
    kind: "moved_to_trash",
    fileCount: fileIds.length,
    source,
  });

  return { ok: true, expandedFileCount: fileIds.length };
}

const RESTORE_MAX_FILES = 200;

export async function restoreBackupFilesFromTrash(
  db: Firestore,
  actorUid: string,
  fileIds: string[],
  opts: { source: BackupFileMutationSource; maxFiles?: number }
): Promise<RestoreFromTrashResult> {
  const { source } = opts;
  const maxFiles = opts.maxFiles ?? RESTORE_MAX_FILES;
  const ids = [...new Set(fileIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (ids.length === 0) {
    return { ok: false, err: { error: "file_ids required", status: 400 } };
  }
  if (ids.length > maxFiles) {
    return { ok: false, err: { error: `Max ${maxFiles} files per request`, status: 400 } };
  }

  const snapshots = await Promise.all(ids.map((id) => db.collection("backup_files").doc(id).get()));

  const toRestore: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const snap = snapshots[i];
    if (!snap.exists) {
      return { ok: false, err: { error: `File not found: ${id}`, status: 404 } };
    }
    const d = snap.data()!;
    const ls = resolveBackupFileLifecycleState(d as Record<string, unknown>);
    if (ls === BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE) {
      return {
        ok: false,
        err: {
          error: "Cannot restore files that are pending permanent deletion",
          status: 400,
        },
      };
    }
    if (ls !== BACKUP_LIFECYCLE_TRASHED) continue;
    try {
      await assertMayRemoveBackupFile(actorUid, id);
    } catch (e) {
      if (e instanceof TrashForbiddenError) {
        return { ok: false, err: { error: e.message, status: 403 } };
      }
      throw e;
    }
    toRestore.push(id);
  }

  if (toRestore.length === 0) {
    return { ok: true, restoredCount: 0 };
  }

  const pkgRestore = new Map<string, { count: number; bytes: number }>();
  const snapById = new Map(ids.map((id, i) => [id, snapshots[i]]));
  for (const id of toRestore) {
    const snap = snapById.get(id)!;
    const d = snap.data()!;
    const delta = packageStatDeltaFromFileData(d);
    if (!delta) continue;
    const cur = pkgRestore.get(delta.packageId) ?? { count: 0, bytes: 0 };
    cur.count += delta.count;
    cur.bytes += delta.bytes;
    pkgRestore.set(delta.packageId, cur);
  }

  const batch = db.batch();
  for (const id of toRestore) {
    batch.update(db.collection("backup_files").doc(id), {
      deleted_at: null,
      lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
    });
  }
  await batch.commit();

  for (const [pid, { count, bytes }] of pkgRestore) {
    await applyMacosPackageDelta(db, new Map([[pid, { count, bytes }]]));
  }

  await Promise.all(
    toRestore.map((fid) =>
      reconcileMacosPackageMembershipForBackupFile(db, fid).catch((err) => {
        console.error("[restore] macos package reconcile:", fid, err);
      })
    )
  );

  await logBackupFilesTrashAudit({
    actorUserId: actorUid,
    kind: "restored_from_trash",
    fileCount: toRestore.length,
    source,
  });

  return { ok: true, restoredCount: toRestore.length };
}
