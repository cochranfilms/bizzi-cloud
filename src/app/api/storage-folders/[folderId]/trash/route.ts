import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { StorageFolderAccessError, trashStorageFolderSubtree } from "@/lib/storage-folders";
import { NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ folderId: string }>;
}

async function readTokenUid(request: Request): Promise<{ uid: string } | { error: Response }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };
  }
}

/** POST /api/storage-folders/[folderId]/trash — subtree soft-trash (files + nested folder rows). */
export async function POST(request: Request, ctx: RouteParams) {
  const auth = await readTokenUid(request);
  if ("error" in auth) return auth.error;

  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  let body: { version?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const expectedVersion =
    typeof body.version === "number" && Number.isFinite(body.version) ? body.version : undefined;

  const db = getAdminFirestore();
  try {
    const summary = await trashStorageFolderSubtree(db, auth.uid, folderId, {
      expectedVersion,
    });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    if (e instanceof StorageFolderAccessError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
