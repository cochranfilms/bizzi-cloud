/**
 * POST /api/files/restore — clear deleted_at on backup_files (same policy as trash) and restore macOS package aggregates.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { restoreBackupFilesFromTrash } from "@/lib/backup-files-trash-domain";
import { NextResponse } from "next/server";

const MAX_FILES = 200;

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

  let body: { file_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.file_ids) ? body.file_ids : [];
  const fileIds = [...new Set(rawIds.filter((id) => typeof id === "string" && id.length > 0))];

  const db = getAdminFirestore();
  const result = await restoreBackupFilesFromTrash(db, uid, fileIds, {
    source: "web",
    maxFiles: MAX_FILES,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.err.error }, { status: result.err.status });
  }

  return NextResponse.json({ ok: true, count: result.restoredCount });
}
