/**
 * Create Mux asset from existing B2 file. Call after video upload complete.
 * POST /api/mux/create-asset
 * Body: { object_key, name, backup_file_id }
 */
import { verifyIdToken } from "@/lib/firebase-admin";
import { verifyBackupFileAccess } from "@/lib/backup-access";
import { NextResponse } from "next/server";
import { createMuxAssetFromBackup } from "@/lib/mux";

const isDevAuthBypass = () =>
  process.env.B2_SKIP_AUTH_FOR_TESTING === "true" &&
  process.env.NODE_ENV === "development";

export async function POST(request: Request) {
  let body: { object_key?: string; name?: string; backup_file_id?: string; user_id?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { object_key: objectKey, name: fileName, backup_file_id: backupFileId } = body;

  if (!objectKey || !fileName || !backupFileId) {
    return NextResponse.json(
      { error: "object_key, name, and backup_file_id required" },
      { status: 400 }
    );
  }

  let uid: string;
  if (isDevAuthBypass() && body.user_id) {
    uid = body.user_id;
  } else {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    if (!token) {
      return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
    }
    try {
      const decoded = await verifyIdToken(token);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }
  }

  const hasAccess = await verifyBackupFileAccess(uid, objectKey);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  try {
    const result = await createMuxAssetFromBackup(objectKey, fileName, backupFileId);
    return NextResponse.json(result ?? { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Mux create failed";
    console.error("[mux create-asset] Error:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
