import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { moveStorageFolder, StorageFolderAccessError } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

/** POST /api/storage-folders/[folderId]/move body: { target_parent_folder_id: string | null, version: number } */
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

  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  let body: { target_parent_folder_id?: string | null; version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const version = typeof body.version === "number" ? body.version : NaN;
  if (!Number.isFinite(version)) {
    return NextResponse.json({ error: "version required" }, { status: 400 });
  }

  let targetParent: string | null;
  if (body.target_parent_folder_id === null || body.target_parent_folder_id === undefined) {
    targetParent = null;
  } else if (typeof body.target_parent_folder_id === "string") {
    const t = body.target_parent_folder_id.trim();
    targetParent = t.length ? t : null;
  } else {
    return NextResponse.json({ error: "Invalid target_parent_folder_id" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await moveStorageFolder(db, uid, folderId, targetParent, version);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
