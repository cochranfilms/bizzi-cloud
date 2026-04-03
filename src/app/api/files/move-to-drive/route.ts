import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { moveBackupFilesToDrive, StorageFolderAccessError } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

/**
 * POST /api/files/move-to-drive
 * Cross-drive file moves with correct folder model v2 fields on the destination.
 * Same-drive moves must use /api/files/move-to-folder.
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
    file_ids?: string[];
    target_drive_id?: string;
    target_folder_id?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const file_ids = Array.isArray(body.file_ids)
    ? body.file_ids.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const target_drive_id = String(body.target_drive_id ?? "").trim();
  const target_folder_id =
    body.target_folder_id === null ||
    body.target_folder_id === undefined ||
    body.target_folder_id === ""
      ? null
      : String(body.target_folder_id).trim();

  if (file_ids.length === 0 || !target_drive_id) {
    return NextResponse.json(
      { error: "file_ids and target_drive_id required" },
      { status: 400 },
    );
  }

  const db = getAdminFirestore();
  try {
    await moveBackupFilesToDrive(db, uid, {
      file_ids,
      target_drive_id,
      target_folder_id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
