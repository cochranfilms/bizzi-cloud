import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { createStorageFolder, StorageFolderAccessError } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

/**
 * POST /api/storage-folders
 * Body: { linked_drive_id, parent_folder_id: string | null, name: string }
 */
export async function POST(request: Request) {
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

  let body: {
    linked_drive_id?: string;
    parent_folder_id?: string | null;
    name?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const linked_drive_id =
    typeof body.linked_drive_id === "string" ? body.linked_drive_id.trim() : "";
  const name = typeof body.name === "string" ? body.name : "";
  const parent_folder_id =
    body.parent_folder_id === null || body.parent_folder_id === ""
      ? null
      : typeof body.parent_folder_id === "string"
        ? body.parent_folder_id
        : null;

  if (!linked_drive_id) {
    return NextResponse.json({ error: "linked_drive_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    const { id } = await createStorageFolder(db, uid, {
      linked_drive_id,
      parent_folder_id,
      name,
    });
    return NextResponse.json({ id });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
