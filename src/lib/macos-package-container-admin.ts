/**
 * Firestore Admin: macos_package_containers + link backup_files for package-level restore and UI.
 */
import { createHash } from "crypto";
import type { DocumentData, Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { packageKindDisplayLabel } from "@/lib/macos-package-bundles";

export const MACOS_PACKAGE_CONTAINERS_COLLECTION = "macos_package_containers";

export function macosPackageContainerDocId(
  linkedDriveId: string,
  rootRelativePath: string,
  packageKind: string
): string {
  const h = createHash("sha256")
    .update(`${linkedDriveId}\0${rootRelativePath}\0${packageKind}`, "utf8")
    .digest("hex");
  return `pkg_${h}`;
}

/** Parent folder path (no trailing slash) for a package root relative_path. */
export function macosPackageParentPath(rootRelativePath: string): string {
  const parts = rootRelativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

export function macosPackageVisibleAtFolderPath(
  rootRelativePath: string,
  folderPathPrefix: string
): boolean {
  const norm = folderPathPrefix.replace(/^\/+|\/+$/g, "");
  return macosPackageParentPath(rootRelativePath) === norm;
}

export async function linkBackupFileToMacosPackageContainer(
  db: Firestore,
  backupFileId: string
): Promise<void> {
  const ref = db.collection("backup_files").doc(backupFileId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const d = snap.data()!;
    if (d.macos_package_id) return;
    if (d.deleted_at) return;

    const rel = String(d.relative_path ?? "");
    const pkgFields = macosPackageFirestoreFieldsFromRelativePath(rel);
    if (!pkgFields.macos_package_kind || !pkgFields.macos_package_root_relative_path) return;

    const driveId = d.linked_drive_id as string;
    const pkgId = macosPackageContainerDocId(
      driveId,
      pkgFields.macos_package_root_relative_path,
      pkgFields.macos_package_kind
    );
    const size = Number(d.size_bytes ?? 0);
    const cref = db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(pkgId);
    const csnap = await t.get(cref);
    const now = FieldValue.serverTimestamp();
    const rootSeg =
      pkgFields.macos_package_root_relative_path.split("/").filter(Boolean).pop() ??
      pkgFields.macos_package_root_relative_path;

    if (!csnap.exists) {
      t.set(cref, {
        linked_drive_id: driveId,
        package_kind: pkgFields.macos_package_kind,
        root_relative_path: pkgFields.macos_package_root_relative_path,
        root_segment_name: rootSeg,
        display_label: packageKindDisplayLabel(pkgFields.macos_package_kind),
        file_count: 1,
        total_bytes: size,
        workspace_id: d.workspace_id ?? null,
        organization_id: d.organization_id ?? null,
        personal_team_owner_id: d.personal_team_owner_id ?? null,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
      });
    } else {
      t.update(cref, {
        file_count: FieldValue.increment(1),
        total_bytes: FieldValue.increment(size),
        last_activity_at: now,
        updated_at: now,
      });
    }

    t.update(ref, {
      macos_package_id: pkgId,
      macos_package_kind: pkgFields.macos_package_kind,
      macos_package_root_relative_path: pkgFields.macos_package_root_relative_path,
    });
  });
}

export function packageStatDeltaFromFileData(d: DocumentData): {
  packageId: string;
  count: number;
  bytes: number;
} | null {
  const pid = d.macos_package_id as string | undefined;
  if (!pid) return null;
  return {
    packageId: pid,
    count: 1,
    bytes: Number(d.size_bytes ?? 0),
  };
}

export async function applyMacosPackageDelta(
  db: Firestore,
  deltas: Map<string, { count: number; bytes: number }>
): Promise<void> {
  for (const [pkgId, { count, bytes }] of deltas) {
    if (count === 0 && bytes === 0) continue;
    const ref = db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(pkgId);
    await ref.update({
      file_count: FieldValue.increment(count),
      total_bytes: FieldValue.increment(bytes),
      last_activity_at: FieldValue.serverTimestamp(),
      updated_at: FieldValue.serverTimestamp(),
    });
  }
}

/** Merge negative count/byte deltas for soft-delete (same semantics as trash route). */
export function mergeMacosPackageTrashDeltasInto(
  into: Map<string, { count: number; bytes: number }>,
  docData: DocumentData
): void {
  const delta = packageStatDeltaFromFileData(docData);
  if (!delta) return;
  const cur = into.get(delta.packageId) ?? { count: 0, bytes: 0 };
  cur.count -= delta.count;
  cur.bytes -= delta.bytes;
  into.set(delta.packageId, cur);
}

/**
 * When permanently removing an active (non-trashed) backup_files row, decrement aggregates once.
 * Trashed rows were already decremented in trash/mount-delete; skip if deleted_at is set.
 */
export async function applyMacosPackageStatsForActiveBackupFileRemoval(
  db: Firestore,
  docData: DocumentData
): Promise<void> {
  if (docData.deleted_at) return;
  const delta = packageStatDeltaFromFileData(docData);
  if (!delta) return;
  await applyMacosPackageDelta(
    db,
    new Map([[delta.packageId, { count: -delta.count, bytes: -delta.bytes }]])
  );
}

/**
 * Recompute macos package fields + container membership from current relative_path and drive.
 * Call after rename/move or to repair drift. Skips trashed files (membership frozen at trash time).
 */
export async function reconcileMacosPackageMembershipForBackupFile(
  db: Firestore,
  backupFileId: string
): Promise<void> {
  const ref = db.collection("backup_files").doc(backupFileId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const d = snap.data()!;
    if (d.deleted_at) return;

    const rel = String(d.relative_path ?? "");
    const driveId = d.linked_drive_id as string;
    const size = Number(d.size_bytes ?? 0);
    const desired = macosPackageFirestoreFieldsFromRelativePath(rel);
    const newPkgId =
      desired.macos_package_kind && desired.macos_package_root_relative_path
        ? macosPackageContainerDocId(
            driveId,
            desired.macos_package_root_relative_path,
            desired.macos_package_kind
          )
        : null;

    const oldPkgId = (d.macos_package_id as string | undefined) ?? null;
    const oldRoot = (d.macos_package_root_relative_path as string | undefined) ?? null;
    const oldKind = (d.macos_package_kind as string | undefined) ?? null;
    const desiredRoot = desired.macos_package_root_relative_path ?? null;
    const desiredKind = desired.macos_package_kind ?? null;
    const now = FieldValue.serverTimestamp();

    if (!newPkgId) {
      if (oldPkgId) {
        await t.get(db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(oldPkgId));
        t.update(db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(oldPkgId), {
          file_count: FieldValue.increment(-1),
          total_bytes: FieldValue.increment(-size),
          last_activity_at: now,
          updated_at: now,
        });
        t.update(ref, {
          macos_package_id: FieldValue.delete(),
          macos_package_kind: FieldValue.delete(),
          macos_package_root_relative_path: FieldValue.delete(),
        });
      }
      return;
    }

    if (oldPkgId === newPkgId) {
      if (oldRoot !== desiredRoot || oldKind !== desiredKind) {
        t.update(ref, {
          macos_package_kind: desiredKind,
          macos_package_root_relative_path: desiredRoot,
        });
      }
      return;
    }

    if (oldPkgId) {
      await t.get(db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(oldPkgId));
      t.update(db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(oldPkgId), {
        file_count: FieldValue.increment(-1),
        total_bytes: FieldValue.increment(-size),
        last_activity_at: now,
        updated_at: now,
      });
    }

    const cref = db.collection(MACOS_PACKAGE_CONTAINERS_COLLECTION).doc(newPkgId);
    const csnap = await t.get(cref);
    const rootSeg =
      desiredRoot!.split("/").filter(Boolean).pop() ?? desiredRoot!;

    if (!csnap.exists) {
      t.set(cref, {
        linked_drive_id: driveId,
        package_kind: desiredKind,
        root_relative_path: desiredRoot,
        root_segment_name: rootSeg,
        display_label: packageKindDisplayLabel(desiredKind!),
        file_count: 1,
        total_bytes: size,
        workspace_id: d.workspace_id ?? null,
        organization_id: d.organization_id ?? null,
        personal_team_owner_id: d.personal_team_owner_id ?? null,
        created_at: now,
        updated_at: now,
        last_activity_at: now,
      });
    } else {
      t.update(cref, {
        file_count: FieldValue.increment(1),
        total_bytes: FieldValue.increment(size),
        last_activity_at: now,
        updated_at: now,
      });
    }

    t.update(ref, {
      macos_package_id: newPkgId,
      macos_package_kind: desiredKind,
      macos_package_root_relative_path: desiredRoot,
    });
  });
}
