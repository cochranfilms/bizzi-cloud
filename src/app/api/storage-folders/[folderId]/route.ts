import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { renameStorageFolder, StorageFolderAccessError } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

/** PATCH /api/storage-folders/[folderId]  body: { name: string, version: number } */
export async function PATCH(request: Request, ctx: RouteParams) {
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

  let body: { name?: string; version?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const version = typeof body.version === "number" ? body.version : NaN;
  if (!name.trim() || !Number.isFinite(version)) {
    return NextResponse.json({ error: "name and version required" }, { status: 400 });
  }

  const db = getAdminFirestore();
  try {
    await renameStorageFolder(db, uid, folderId, name, version);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
