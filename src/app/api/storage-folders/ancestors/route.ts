import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertFolderModelV2,
  assertLinkedDriveReadAccess,
  getStorageFolderAncestors,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { NextResponse } from "next/server";

/** GET /api/storage-folders/ancestors?folder_id= */
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

  const folderId = (new URL(request.url).searchParams.get("folder_id") ?? "").trim();
  if (!folderId) {
    return NextResponse.json({ error: "folder_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const folderSnap = await db.collection("storage_folders").doc(folderId).get();
  if (!folderSnap.exists) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  const linkedDriveId = folderSnap.data()!.linked_drive_id as string;
  const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
  try {
    await assertLinkedDriveReadAccess(db, uid, driveSnap);
    await assertFolderModelV2(driveSnap);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const ancestors = await getStorageFolderAncestors(db, folderId);
  return NextResponse.json({ ancestors });
}
