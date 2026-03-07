import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(token).get();

  if (!shareSnap.exists) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return NextResponse.json({ error: "Share expired" }, { status: 410 });
  }

  const authHeader = request.headers.get("Authorization");
  const access = await verifyShareAccess(
    {
      owner_id: share.owner_id as string,
      access_level: share.access_level as string | undefined,
      invited_emails: share.invited_emails as string[] | undefined,
    },
    authHeader
  );

  if (!access.allowed) {
    return NextResponse.json(
      { error: access.code, message: access.message },
      { status: 403 }
    );
  }

  const linkedDriveId = share.linked_drive_id as string;
  const ownerId = share.owner_id as string;
  const backupFileId = share.backup_file_id as string | null | undefined;
  const isFileShare = !!backupFileId;

  let folderName: string;
  let files: { id: string; name: string; path: string; object_key: string; size_bytes: number }[];

  if (isFileShare) {
    const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (!fileSnap.exists) {
      return NextResponse.json({ error: "Shared file not found" }, { status: 404 });
    }
    const fileData = fileSnap.data();
    if (fileData?.deleted_at) {
      return NextResponse.json({ error: "Shared file was deleted" }, { status: 410 });
    }
    if (fileData?.userId !== ownerId || fileData?.linked_drive_id !== linkedDriveId) {
      return NextResponse.json({ error: "Invalid share" }, { status: 404 });
    }
    const path = (fileData.relative_path ?? "") as string;
    const name = path.split("/").filter(Boolean).pop() ?? path ?? "File";
    folderName = name;
    files = [
      {
        id: fileSnap.id,
        name,
        path,
        object_key: (fileData.object_key ?? "") as string,
        size_bytes: (fileData.size_bytes ?? 0) as number,
      },
    ];
  } else {
    const driveSnap = await db.collection("linked_drives").doc(linkedDriveId).get();
    folderName = driveSnap.exists
      ? (driveSnap.data()?.name ?? "Shared folder")
      : "Shared folder";

    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", ownerId)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("deleted_at", "==", null)
      .get();

    files = filesSnap.docs.map((d) => {
      const data = d.data();
      const path = (data.relative_path ?? "") as string;
      const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
      return {
        id: d.id,
        name,
        path,
        object_key: data.object_key ?? "",
        size_bytes: data.size_bytes ?? 0,
      };
    });
  }

  return NextResponse.json({
    folder_name: folderName,
    item_type: isFileShare ? "file" : "folder",
    permission: share.permission ?? "view",
    access_level: share.access_level ?? "public",
    files,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!bearerToken) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(bearerToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { access_level: accessLevel, invited_emails: invitedEmails } = body;

  const db = getAdminFirestore();
  const shareRef = db.collection("folder_shares").doc(shareToken);
  const shareSnap = await shareRef.get();

  if (!shareSnap.exists) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = shareSnap.data();
  if (share?.owner_id !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};

  if (accessLevel === "private" || accessLevel === "public") {
    updates.access_level = accessLevel;
  }

  if (Array.isArray(invitedEmails)) {
    updates.invited_emails = invitedEmails.filter((e: unknown) => typeof e === "string");
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true });
  }

  await shareRef.update(updates);

  return NextResponse.json({ ok: true });
}
