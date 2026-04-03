import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertFolderModelV2,
  assertLinkedDriveReadAccess,
  listStorageFolderChildren,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import { buildRelativePathFromFolderNames } from "@/lib/storage-folders/path-resolver";
import { NextResponse } from "next/server";

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

    const files = fSnap.docs.map((d) => {
      const data = d.data();
      const fileName =
        String(data.file_name ?? "").trim() ||
        (String(data.relative_path ?? "").split("/").filter(Boolean).pop() ?? "");
      const relative_path =
        String(data.relative_path ?? "").trim() ||
        buildRelativePathFromFolderNames(parentPathNames, fileName);
      return { id: d.id, ...data, file_name: fileName, relative_path };
    });

    return NextResponse.json({ folders: folderList, files });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
