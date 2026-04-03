/**
 * POST /api/files/rename-backup-file
 * Body: { backup_file_id: string, new_name: string }
 *
 * Renames a backup file in Firestore and, for path-keyed B2 objects (backups/...),
 * copies the object to the new key so metadata and storage stay consistent.
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { renameBackupFileServer } from "@/lib/backup-file-rename-server";
import { reconcileMacosPackageMembershipForBackupFile } from "@/lib/macos-package-container-admin";
import { StorageFolderAccessError } from "@/lib/storage-folders/linked-drive-access";
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

  let body: { backup_file_id?: string; new_name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const backup_file_id =
    typeof body.backup_file_id === "string" ? body.backup_file_id.trim() : "";
  const new_name = typeof body.new_name === "string" ? body.new_name : "";
  if (!backup_file_id) {
    return NextResponse.json({ error: "backup_file_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await renameBackupFileServer(db, uid, backup_file_id, new_name);
    await reconcileMacosPackageMembershipForBackupFile(db, backup_file_id).catch((err) => {
      console.error("[rename-backup-file] macos package reconcile:", err);
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    const msg = e instanceof Error ? e.message : "Rename failed";
    console.error("[rename-backup-file]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
