/**
 * POST /api/files/trash — soft-delete backup_files (move to trash) with server-side policy checks.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { moveBackupFilesToTrashFromWebInput } from "@/lib/backup-files-trash-domain";
import { NextResponse } from "next/server";

/** Max IDs in the request body (after dedupe). */
const MAX_INPUT_IDS = 200;
/** Safety cap after expanding macos-pkg:* rows to real Firestore IDs. */
const MAX_EXPANDED_IDS = 12_000;

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

  const db = getAdminFirestore();
  const result = await moveBackupFilesToTrashFromWebInput(db, uid, inputIds, {
    source: "web",
    maxInputIds: MAX_INPUT_IDS,
    maxExpandedIds: MAX_EXPANDED_IDS,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.err.error }, { status: result.err.status });
  }

  return NextResponse.json({ ok: true, count: result.expandedFileCount });
}
