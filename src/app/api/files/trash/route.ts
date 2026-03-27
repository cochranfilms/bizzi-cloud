/**
 * POST /api/files/trash — soft-delete backup_files (move to trash) with server-side policy checks.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { assertCanTrashBackupFile, TrashForbiddenError } from "@/lib/container-delete-policy";
import { FieldValue } from "firebase-admin/firestore";
import {
  applyMacosPackageDelta,
  mergeMacosPackageTrashDeltasInto,
} from "@/lib/macos-package-container-admin";
import { expandTrashInputIdsWithMacosPackages } from "@/lib/macos-package-trash-expand";
import { NextResponse } from "next/server";

/** Max IDs in the request body (after dedupe). */
const MAX_INPUT_IDS = 200;
/** Safety cap after expanding macos-pkg:* rows to real Firestore IDs. */
const MAX_EXPANDED_IDS = 12_000;
const UPDATE_BATCH = 450;

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
  const inputIds = [...new Set(rawIds.filter((id) => typeof id === "string" && id.length > 0))];
  if (inputIds.length === 0) {
    return NextResponse.json({ error: "file_ids required" }, { status: 400 });
  }
  if (inputIds.length > MAX_INPUT_IDS) {
    return NextResponse.json({ error: `Max ${MAX_INPUT_IDS} files per request` }, { status: 400 });
  }

  const db = getAdminFirestore();
  const expandedResult = await expandTrashInputIdsWithMacosPackages(db, inputIds);
  if (!expandedResult.ok) {
    return NextResponse.json({ error: expandedResult.error }, { status: 400 });
  }
  const fileIds = expandedResult.expanded;
  if (fileIds.length === 0) {
    return NextResponse.json({ error: "No files to delete" }, { status: 400 });
  }
  if (fileIds.length > MAX_EXPANDED_IDS) {
    return NextResponse.json(
      {
        error: `Too many files (${fileIds.length}). Delete large packages from the drive view in smaller steps or contact support.`,
      },
      { status: 400 }
    );
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

  const snapshots = await Promise.all(fileIds.map((id) => db.collection("backup_files").doc(id).get()));
  const pkgDeltas = new Map<string, { count: number; bytes: number }>();
  /** Snapshots must reflect pre-trash rows only (assert ensured not deleted). */
  for (let i = 0; i < fileIds.length; i++) {
    const snap = snapshots[i];
    if (!snap.exists) continue;
    const d = snap.data()!;
    if (d.deleted_at) continue;
    mergeMacosPackageTrashDeltasInto(pkgDeltas, d);
  }

  for (let i = 0; i < fileIds.length; i += UPDATE_BATCH) {
    const batch = db.batch();
    for (const id of fileIds.slice(i, i + UPDATE_BATCH)) {
      batch.update(db.collection("backup_files").doc(id), {
        deleted_at: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }

  const negDeltas = new Map<string, { count: number; bytes: number }>();
  for (const [pid, { count, bytes }] of pkgDeltas) {
    negDeltas.set(pid, { count, bytes });
  }
  if (negDeltas.size > 0) {
    await applyMacosPackageDelta(db, negDeltas);
  }

  return NextResponse.json({ ok: true, count: fileIds.length });
}
