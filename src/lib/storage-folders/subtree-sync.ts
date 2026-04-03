import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  Firestore,
} from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { buildRelativePathFromFolderNames } from "./path-resolver";
import { COLLECTION_STORAGE_FOLDERS } from "./types";

export async function collectFolderDescendants(
  db: Firestore,
  rootFolderId: string,
): Promise<Array<{ ref: DocumentReference; data: DocumentData }>> {
  const out: Array<{ ref: DocumentReference; data: DocumentData }> = [];
  const queue = [rootFolderId];
  while (queue.length) {
    const id = queue.shift()!;
    const children = await db
      .collection(COLLECTION_STORAGE_FOLDERS)
      .where("parent_folder_id", "==", id)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .get();
    for (const d of children.docs) {
      out.push({ ref: d.ref, data: d.data() });
      queue.push(d.id);
    }
  }
  return out;
}

const FIRESTORE_IN_MAX = 30;

export async function countActiveFilesInFolderSubtree(
  db: Firestore,
  linkedDriveId: string,
  folderIds: Set<string>,
): Promise<number> {
  const ids = [...folderIds];
  let count = 0;
  for (let i = 0; i < ids.length; i += FIRESTORE_IN_MAX) {
    const chunk = ids.slice(i, i + FIRESTORE_IN_MAX);
    const snap = await db
      .collection("backup_files")
      .where("linked_drive_id", "==", linkedDriveId)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .where("folder_id", "in", chunk)
      .get();
    count += snap.size;
  }
  return count;
}

/** Refresh derived path fields on files whose folder_id is under rootFolderId (+ descendants). */
export async function recomputeFilesUnderFolderSubtree(
  db: Firestore,
  linkedDriveId: string,
  rootFolderId: string,
  rootFolderSnap: DocumentSnapshot,
): Promise<void> {
  const folderIds = new Set<string>([rootFolderId]);
  const desc = await collectFolderDescendants(db, rootFolderId);
  for (const { ref } of desc) folderIds.add(ref.id);

  const folderCache = new Map<string, DocumentData>();
  folderCache.set(rootFolderId, rootFolderSnap.data()!);
  for (const { ref, data } of desc) {
    folderCache.set(ref.id, data);
  }

  const snap = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .get();

  let batch = db.batch();
  let ops = 0;
  const commitIfNeeded = async () => {
    if (ops >= 450) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const doc of snap.docs) {
    const fid = doc.data().folder_id as string | null | undefined;
    if (!fid || !folderIds.has(fid)) continue;
    let fileName = String(doc.data().file_name ?? "").trim();
    if (!fileName) {
      const rp = String(doc.data().relative_path ?? "");
      fileName = rp.split("/").filter(Boolean).pop() ?? "";
    }
    if (!fileName) continue;
    const fdata = folderCache.get(fid);
    if (!fdata) continue;
    const names = fdata.path_names as string[];
    const relative_path = buildRelativePathFromFolderNames(names, fileName);
    const folder_path_ids = [...(fdata.path_ids as string[]), fid];
    batch.update(doc.ref, {
      relative_path,
      folder_path_ids,
    });
    ops++;
    await commitIfNeeded();
  }
  if (ops > 0) await batch.commit();
}

export type ComputedFolderPaths = {
  path_ids: string[];
  path_names: string[];
  depth: number;
  parent_folder_id: string | null;
  name: string;
};

/**
 * After the moved root's new placement is known, BFS assigns each descendant
 * path_ids / path_names / depth strictly from the parent's computed row (no stale child caches).
 */
export function computeMovedSubtreeFolderStates(params: {
  movedRootId: string;
  movedRootName: string;
  movedRootNewParentId: string | null;
  movedRootNewPathIds: string[];
  movedRootNewPathNames: string[];
  movedRootNewDepth: number;
  descendantRows: Array<{ id: string; parent_folder_id: string; name: string }>;
}): Map<string, ComputedFolderPaths> {
  const {
    movedRootId,
    movedRootName,
    movedRootNewParentId,
    movedRootNewPathIds,
    movedRootNewPathNames,
    movedRootNewDepth,
    descendantRows,
  } = params;

  const computed = new Map<string, ComputedFolderPaths>();
  computed.set(movedRootId, {
    path_ids: movedRootNewPathIds,
    path_names: movedRootNewPathNames,
    depth: movedRootNewDepth,
    parent_folder_id: movedRootNewParentId,
    name: movedRootName,
  });

  const childrenByParent = new Map<string, Array<{ id: string; name: string }>>();
  for (const row of descendantRows) {
    const list = childrenByParent.get(row.parent_folder_id) ?? [];
    list.push({ id: row.id, name: row.name });
    childrenByParent.set(row.parent_folder_id, list);
  }

  const queue = [movedRootId];
  while (queue.length) {
    const pid = queue.shift()!;
    const parentRow = computed.get(pid);
    if (!parentRow) continue;
    const kids = childrenByParent.get(pid);
    if (!kids) continue;
    for (const k of kids) {
      computed.set(k.id, {
        path_ids: [...parentRow.path_ids, pid],
        path_names: [...parentRow.path_names, parentRow.name],
        depth: parentRow.depth + 1,
        parent_folder_id: pid,
        name: k.name,
      });
      queue.push(k.id);
    }
  }

  return computed;
}
