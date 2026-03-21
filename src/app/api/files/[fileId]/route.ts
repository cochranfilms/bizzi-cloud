/**
 * GET /api/files/[fileId] - Fetch file metadata by ID (for users with access, including shared files).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { canAccessBackupFileById } from "@/lib/file-access";
import { NextResponse } from "next/server";

async function requireAuth(request: Request): Promise<{ uid: string; email?: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { fileId } = await params;
  if (!fileId) return NextResponse.json({ error: "fileId required" }, { status: 400 });

  const hasAccess = await canAccessBackupFileById(auth.uid, fileId, auth.email);
  if (!hasAccess) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const db = getAdminFirestore();
  const fileSnap = await db.collection("backup_files").doc(fileId).get();
  if (!fileSnap.exists) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const data = fileSnap.data()!;
  if (data.deleted_at) return NextResponse.json({ error: "File not found" }, { status: 404 });

  const linkedDriveId = (data.linked_drive_id ?? "") as string;
  let driveName = "Unknown drive";
  if (linkedDriveId) {
    const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
    if (driveSnap.exists) driveName = driveSnap.data()?.name ?? "Unknown drive";
  }

  const path = (data.relative_path ?? "") as string;
  const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";

  return NextResponse.json({
    id: fileSnap.id,
    name,
    path,
    objectKey: data.object_key ?? "",
    size: data.size_bytes ?? 0,
    modifiedAt: data.modified_at?.toDate?.()?.toISOString() ?? null,
    driveId: linkedDriveId,
    driveName,
    contentType: data.content_type ?? null,
    galleryId: data.gallery_id ?? null,
    proxyStatus: data.proxy_status ?? null,
  });
}
