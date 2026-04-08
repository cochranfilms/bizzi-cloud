import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertFolderModelV2,
  assertLinkedDriveReadAccess,
  compareStorageFolderRowsTransfersRootFirst,
  getStorageFolderCoverFile,
  listStorageFolderChildren,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { buildRelativePathFromFolderNames } from "@/lib/storage-folders/path-resolver";
import type { Firestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

/** Direct child folders + active files in a v2 folder (same notion as home Bizzi Cloud Folders / storage-folder-roots). */
async function storageFolderDirectItemCount(
  db: Firestore,
  linkedDriveId: string,
  folderId: string
): Promise<number> {
  const { folders: subFolders } = await listStorageFolderChildren(db, linkedDriveId, folderId);
  const filesSnap = await db
    .collection("backup_files")
    .where("linked_drive_id", "==", linkedDriveId)
    .where("folder_id", "==", folderId)
    .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
    .select()
    .limit(500)
    .get();
  return subFolders.length + filesSnap.size;
}

/**
 * GET /api/storage-folders/list?drive_id=&parent_folder_id=
 * parent_folder_id omitted or empty = root
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const driveId = (searchParams.get("drive_id") ?? "").trim();
  const parentRaw = searchParams.get("parent_folder_id");
  const parent_folder_id =
    parentRaw === null || parentRaw === "" ? null : parentRaw.trim();

  if (!driveId) {
    return NextResponse.json({ error: "drive_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const driveSnap = await db.collection("linked_drives").doc(driveId).get();
  try {
    await assertLinkedDriveReadAccess(db, uid, driveSnap);
    await assertFolderModelV2(driveSnap);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  try {
    const { folders: folderList } = await listStorageFolderChildren(
      db,
      driveId,
      parent_folder_id,
    );

    const baseQ = db
      .collection("backup_files")
      .where("linked_drive_id", "==", driveId)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE);

    const fileQuery =
      parent_folder_id === null
        ? baseQ.where("folder_id", "==", null).limit(500)
        : baseQ.where("folder_id", "==", parent_folder_id).limit(500);

    const fSnap = await fileQuery.get();

    let parentPathNames: string[] = [];
    if (parent_folder_id) {
      const folderSnap = await db.collection("storage_folders").doc(parent_folder_id).get();
      if (folderSnap.exists) {
        parentPathNames = folderSnap.data()!.path_names as string[];
      }
    }

    let files = fSnap.docs.map((d) => {
      const data = d.data();
      const fileName =
        String(data.file_name ?? "").trim() ||
        (String(data.relative_path ?? "").split("/").filter(Boolean).pop() ?? "");
      const relative_path =
        String(data.relative_path ?? "").trim() ||
        buildRelativePathFromFolderNames(parentPathNames, fileName);
      return { id: d.id, ...data, file_name: fileName, relative_path };
    });
    /** Root: only immediate children. Path-based imports live under virtual segments (home tile + `path=`). */
    if (parent_folder_id === null) {
      files = files.filter((row) => {
        const rp = String((row as { relative_path?: string }).relative_path ?? "")
          .replace(/^\/+/, "")
          .trim();
        return !rp.includes("/");
      });
    }

    const foldersWithCounts = await Promise.all(
      folderList.map(async (row) => {
        const fid = String((row as { id?: string }).id ?? "").trim();
        if (!fid) return { ...row, item_count: 0, cover_file: null };
        try {
          const [item_count, cover_file] = await Promise.all([
            storageFolderDirectItemCount(db, driveId, fid),
            getStorageFolderCoverFile(db, driveId, fid),
          ]);
          return { ...row, item_count, cover_file };
        } catch {
          return { ...row, item_count: 0, cover_file: null };
        }
      })
    );

    foldersWithCounts.sort(compareStorageFolderRowsTransfersRootFirst);

    return NextResponse.json({ folders: foldersWithCounts, files });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
