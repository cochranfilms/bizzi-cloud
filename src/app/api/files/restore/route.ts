/**
 * POST /api/files/restore — clear deleted_at on backup_files (same policy as trash) and restore macOS package aggregates.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { assertMayRemoveBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { FieldValue } from "firebase-admin/firestore";
import {
  packageStatDeltaFromFileData,
  applyMacosPackageDelta,
  reconcileMacosPackageMembershipForBackupFile,
} from "@/lib/macos-package-container-admin";
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

  const db = getAdminFirestore();
  const snapshots = await Promise.all(fileIds.map((id) => db.collection("backup_files").doc(id).get()));

  for (let i = 0; i < fileIds.length; i++) {
    const id = fileIds[i];
    const snap = snapshots[i];
    if (!snap.exists) {
      return NextResponse.json({ error: `File not found: ${id}` }, { status: 404 });
    }
    const d = snap.data()!;
    if (!d.deleted_at) {
      continue;
    }
    try {
      await assertMayRemoveBackupFile(uid, id);
    } catch (err) {
      if (err instanceof TrashForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
    }
  }

  const pkgRestore = new Map<string, { count: number; bytes: number }>();
  for (let i = 0; i < fileIds.length; i++) {
    const snap = snapshots[i];
    if (!snap.exists) continue;
    const d = snap.data()!;
    if (!d.deleted_at) continue;
    const delta = packageStatDeltaFromFileData(d);
    if (!delta) continue;
    const cur = pkgRestore.get(delta.packageId) ?? { count: 0, bytes: 0 };
    cur.count += delta.count;
    cur.bytes += delta.bytes;
    pkgRestore.set(delta.packageId, cur);
  }

  const batch = db.batch();
  for (const id of fileIds) {
    batch.update(db.collection("backup_files").doc(id), {
      deleted_at: null,
    });
  }
  await batch.commit();

  for (const [pid, { count, bytes }] of pkgRestore) {
    await applyMacosPackageDelta(db, new Map([[pid, { count, bytes }]]));
  }

  await Promise.all(
    fileIds.map((fid) =>
      reconcileMacosPackageMembershipForBackupFile(db, fid).catch((err) => {
        console.error("[restore] macos package reconcile:", fid, err);
      })
    )
  );

  return NextResponse.json({ ok: true, count: fileIds.length });
}
