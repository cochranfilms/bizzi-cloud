/**
 * POST /api/linked-drives/[driveId]/folder-model
 * Body: { action: "enable_v2", migrate?: boolean }
 * migrate: backfill storage_folders + file fields from relative_path (owner-only in migrate util)
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import {
  assertLinkedDriveWriteAccess,
  FOLDER_MODEL_V2,
  migrateLinkedDriveToFolderModelV2,
  StorageFolderAccessError,
} from "@/lib/storage-folders";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ driveId: string }>;
}

export async function POST(request: Request, ctx: RouteParams) {
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

  const { driveId } = await ctx.params;
  if (!driveId) {
    return NextResponse.json({ error: "Missing drive id" }, { status: 400 });
  }

  let body: { action?: string; migrate?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action !== "enable_v2") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const driveRef = db.collection("linked_drives").doc(driveId);
  const driveSnap = await driveRef.get();
  if (!driveSnap.exists) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  try {
    await assertLinkedDriveWriteAccess(db, uid, driveSnap);
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  if (body.migrate === true) {
    try {
      const result = await migrateLinkedDriveToFolderModelV2(db, uid, driveId);
      return NextResponse.json({ ok: true, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Migration failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }

  await driveRef.update({
    folder_model_version: FOLDER_MODEL_V2,
    supports_nested_folders: true,
  });
  return NextResponse.json({ ok: true, foldersCreated: 0, filesUpdated: 0 });
}
