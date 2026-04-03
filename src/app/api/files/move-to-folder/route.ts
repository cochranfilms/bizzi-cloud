/**
 * POST /api/files/move-to-folder
 * Body: { file_id: string, target_folder_id: string | null }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { moveFileToFolder, StorageFolderAccessError } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

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

  let body: { file_id?: string; target_folder_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const file_id = typeof body.file_id === "string" ? body.file_id.trim() : "";
  const target_folder_id =
    body.target_folder_id === null || body.target_folder_id === ""
      ? null
      : typeof body.target_folder_id === "string"
        ? body.target_folder_id.trim()
        : null;

  if (!file_id) {
    return NextResponse.json({ error: "file_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await moveFileToFolder(db, uid, { file_id, target_folder_id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
