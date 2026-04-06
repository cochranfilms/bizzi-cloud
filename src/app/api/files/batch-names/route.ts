/**
 * POST /api/files/batch-names — resolve display names for the signed-in owner's backup_files.
 * Body: { file_ids: string[] }
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

const MAX_IDS = 100;

function fileDisplayName(data: Record<string, unknown>): string {
  const path = (data.relative_path as string) ?? "";
  const base = path.split("/").filter(Boolean).pop();
  if (base) return base;
  const name = data.name as string | undefined;
  if (name && String(name).trim()) return String(name).trim();
  return "File";
}

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

  let body: { file_ids?: unknown };
  try {
    body = (await request.json()) as { file_ids?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = Array.isArray(body.file_ids) ? body.file_ids : [];
  const ids = [
    ...new Set(raw.filter((id): id is string => typeof id === "string" && id.length > 0)),
  ];

  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `Maximum ${MAX_IDS} files per request` }, { status: 400 });
  }

  if (ids.length === 0) {
    return NextResponse.json({ files: [] as { id: string; name: string }[] });
  }

  const db = getAdminFirestore();
  const files: { id: string; name: string }[] = [];

  for (const id of ids) {
    const snap = await db.collection("backup_files").doc(id).get();
    if (!snap.exists) continue;
    const d = snap.data()!;
    const owner = (d.userId as string | undefined) ?? (d.owner_user_id as string | undefined);
    if (owner !== uid) continue;
    if (d.deleted_at) continue;
    files.push({ id, name: fileDisplayName(d as Record<string, unknown>) });
  }

  return NextResponse.json({ files });
}
