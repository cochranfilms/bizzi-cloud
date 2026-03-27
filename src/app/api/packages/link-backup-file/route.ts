/**
 * POST /api/packages/link-backup-file — link a backup_files row to macos_package_containers (client-created Firestore rows).
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";
import { verifyBackupFileAccessWithGalleryFallback } from "@/lib/backup-access";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  let body: { backup_file_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const id = body.backup_file_id;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "backup_file_id required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const snap = await db.collection("backup_files").doc(id).get();
  if (!snap.exists) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const d = snap.data()!;
  const objectKey = d.object_key as string | undefined;
  if (!objectKey) {
    return NextResponse.json({ error: "Invalid file" }, { status: 400 });
  }
  const allowed = await verifyBackupFileAccessWithGalleryFallback(uid, objectKey);
  if (!allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  await linkBackupFileToMacosPackageContainer(db, id);
  return NextResponse.json({ ok: true });
}
