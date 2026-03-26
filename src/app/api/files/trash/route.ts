/**
 * POST /api/files/trash — soft-delete backup_files (move to trash) with server-side policy checks.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { assertCanTrashBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { FieldValue } from "firebase-admin/firestore";
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
  if (fileIds.length === 0) {
    return NextResponse.json({ error: "file_ids required" }, { status: 400 });
  }
  if (fileIds.length > MAX_FILES) {
    return NextResponse.json({ error: `Max ${MAX_FILES} files per request` }, { status: 400 });
  }

  for (const id of fileIds) {
    try {
      await assertCanTrashBackupFile(uid, id);
    } catch (err) {
      if (err instanceof TrashForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  const db = getAdminFirestore();
  const batch = db.batch();
  for (const id of fileIds) {
    batch.update(db.collection("backup_files").doc(id), {
      deleted_at: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();

  return NextResponse.json({ ok: true, count: fileIds.length });
}
