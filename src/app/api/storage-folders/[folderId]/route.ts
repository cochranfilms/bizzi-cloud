import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertFolderModelV2,
  assertLinkedDriveReadAccess,
  renameStorageFolder,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { COLLECTION_STORAGE_FOLDERS } from "@/lib/storage-folders/types";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

async function readTokenUid(request: Request): Promise<{ uid: string } | { error: Response }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };
  }
}

/** GET /api/storage-folders/[folderId] — name + version for rename UI */
export async function GET(request: Request, ctx: RouteParams) {
  const auth = await readTokenUid(request);
  if ("error" in auth) return auth.error;

  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const folderSnap = await db.collection(COLLECTION_STORAGE_FOLDERS).doc(folderId).get();
  if (!folderSnap.exists) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }
  const folder = folderSnap.data()!;
  const linkedDriveId = String(folder.linked_drive_id ?? "");
  if (!linkedDriveId) {
    return NextResponse.json({ error: "Invalid folder" }, { status: 400 });
  }
  const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
  try {
    await assertLinkedDriveReadAccess(db, auth.uid, driveSnap);
    await assertFolderModelV2(driveSnap);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  return NextResponse.json({
    id: folderSnap.id,
    name: String(folder.name ?? ""),
    version: typeof folder.version === "number" ? folder.version : Number(folder.version ?? 1),
    linked_drive_id: linkedDriveId,
    parent_folder_id: folder.parent_folder_id ?? null,
  });
}

/** PATCH /api/storage-folders/[folderId]  body: { name: string, version: number } */
export async function PATCH(request: Request, ctx: RouteParams) {
  const auth = await readTokenUid(request);
  if ("error" in auth) return auth.error;
  const { uid } = auth;

  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  let body: { name?: string; version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const version = typeof body.version === "number" ? body.version : NaN;
  if (!name.trim() || !Number.isFinite(version)) {
    return NextResponse.json({ error: "name and version required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await renameStorageFolder(db, uid, folderId, name, version);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
