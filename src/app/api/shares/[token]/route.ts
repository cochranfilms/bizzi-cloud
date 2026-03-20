import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
import { createShareNotifications } from "@/lib/notification-service";
import { sendShareFileEmailsToInvitees } from "@/lib/emailjs";
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

  const ownerId = share.owner_id as string;
  const referencedFileIds = share.referenced_file_ids as string[] | undefined;
  const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

  let folderName: string;
  let itemType: "file" | "folder";
  let files: { id: string; name: string; path: string; object_key: string; size_bytes: number }[];

  if (isVirtualShare) {
    folderName = (share.folder_name as string) ?? "Shared folder";
    itemType = "folder";
    files = [];
    for (const fileId of referencedFileIds) {
      const fileSnap = await db.collection("backup_files").doc(fileId).get();
      if (!fileSnap.exists) continue;
      const fileData = fileSnap.data();
      if (fileData?.deleted_at) continue;
      if (fileData?.userId !== ownerId) continue;
      const path = (fileData.relative_path ?? "") as string;
      const name = path.split("/").filter(Boolean).pop() ?? path ?? "?";
      files.push({
        id: fileSnap.id,
        name,
        path,
        object_key: (fileData.object_key ?? "") as string,
        size_bytes: (fileData.size_bytes ?? 0) as number,
      });
    }
  } else {
    const linkedDriveId = share.linked_drive_id as string;
    const backupFileId = share.backup_file_id as string | null | undefined;
    const isFileShare = !!backupFileId;
    itemType = isFileShare ? "file" : "folder";

    if (isFileShare) {
      const fileSnap = await db.collection("backup_files").doc(backupFileId!).get();
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
  }

  const version = typeof share.version === "number" ? share.version : 1;
  const response: Record<string, unknown> = {
    folder_name: folderName,
    item_type: itemType,
    permission: share.permission ?? "view",
    access_level: share.access_level ?? "public",
    version,
    files,
  };
  // Include invited_emails for owner (so they can edit the share)
  let requesterUid: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const decoded = await verifyIdToken(authHeader.slice(7).trim());
      requesterUid = decoded.uid;
    } catch {
      /* ignore */
    }
  }
  if (requesterUid === ownerId) {
    response.invited_emails = share.invited_emails ?? [];
  }
  return NextResponse.json(response);
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
  const {
    access_level: accessLevel,
    invited_emails: invitedEmails,
    permission: permissionUpdate,
    folder_name: folderNameUpdate,
    version: requestedVersion,
  } = body;

  if (typeof requestedVersion !== "number") {
    return NextResponse.json(
      { error: "Version required for optimistic locking; refetch share and retry" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const shareRef = db.collection("folder_shares").doc(shareToken);

  const result = await db.runTransaction(async (tx) => {
    const shareSnap = await tx.get(shareRef);
    if (!shareSnap.exists) return { status: 404 as const };
    const share = shareSnap.data()!;
    if (share.owner_id !== uid) return { status: 403 as const };
    const currentVersion = typeof share.version === "number" ? share.version : 1;
    if (currentVersion !== requestedVersion) return { status: 409 as const };

    const updates: Record<string, unknown> = {};
    if (accessLevel === "private" || accessLevel === "public") {
      updates.access_level = accessLevel;
    }
    if (permissionUpdate === "view" || permissionUpdate === "edit") {
      updates.permission = permissionUpdate;
    }
    if (
      typeof folderNameUpdate === "string" &&
      folderNameUpdate.trim().length > 0
    ) {
      updates.folder_name = folderNameUpdate.trim();
    }
    const prevInvited = (share.invited_emails as string[] | undefined) ?? [];
    let newInvitedEmails: string[] = [];
    if (Array.isArray(invitedEmails)) {
      newInvitedEmails = invitedEmails
        .filter((e: unknown) => typeof e === "string")
        .map((e) => (e as string).trim().toLowerCase())
        .filter(Boolean);
      updates.invited_emails = newInvitedEmails;
    }
    if (Object.keys(updates).length === 0) return { status: 200 as const, ok: true };

    updates.version = currentVersion + 1;
    tx.update(shareRef, updates);
    const effectiveFolderName =
      (updates.folder_name as string) ?? (share.folder_name as string) ?? "Shared folder";
    return {
      status: 200 as const,
      ok: true,
      newInvitedEmails,
      prevInvited,
      folderName: effectiveFolderName,
      fileIds: (share.referenced_file_ids as string[] | undefined) ?? (share.backup_file_id ? [share.backup_file_id] : []),
      linkedDriveId: share.linked_drive_id as string | undefined,
      permission: (updates.permission as string) ?? share.permission ?? "view",
    };
  });

  if (result.status === 404) return NextResponse.json({ error: "Share not found" }, { status: 404 });
  if (result.status === 403) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (result.status === 409) {
    return NextResponse.json(
      { error: "Share was modified by another user; refetch and try again" },
      { status: 409 }
    );
  }

  // Send notifications and emails to newly added invitees
  const newEmails = result.ok && "newInvitedEmails" in result ? (result.newInvitedEmails ?? []) : [];
  if (newEmails.length > 0) {
    const prevSet = new Set((result.prevInvited ?? []).map((e: string) => e.toLowerCase()));
    const newlyAdded = (result.newInvitedEmails as string[]).filter((e) => !prevSet.has(e.toLowerCase()));
    if (newlyAdded.length > 0) {
      const profileSnap = await db.collection("profiles").doc(uid).get();
      let actorDisplayName = (profileSnap.data()?.displayName as string)?.trim();
      if (!actorDisplayName) {
        try {
          const authUser = await getAdminAuth().getUser(uid);
          actorDisplayName =
            (authUser.displayName as string)?.trim() ??
            authUser.email?.split("@")[0] ??
            "Someone";
        } catch {
          actorDisplayName = "Someone";
        }
      }
      let folderNameVal = result.folderName as string;
      const fileIds = (result.fileIds as string[]) ?? [];
      if (!folderNameVal && (result.linkedDriveId as string)) {
        const driveSnap = await db.collection("linked_drives").doc(result.linkedDriveId as string).get();
        folderNameVal = driveSnap.exists ? (driveSnap.data()?.name as string) ?? "Folder" : "Folder";
      }
      await Promise.all([
        createShareNotifications({
          sharedByUserId: uid,
          actorDisplayName,
          fileIds,
          folderShareId: shareToken,
          permission: (result.permission as string) ?? "view",
          invitedEmails: newlyAdded,
          folderName: folderNameVal,
        }),
        sendShareFileEmailsToInvitees({
          invitedEmails: newlyAdded,
          sharedByUserId: uid,
          actorDisplayName,
          fileIds,
          folderName: folderNameVal,
          shareToken,
        }),
      ]);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
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

  // Delete share record only—never delete backup_files.
  // Virtual shares (referenced_file_ids): only this doc is deleted; originals stay.
  // Standard shares (linked_drive_id): only this doc is deleted; drive and files stay.
  await shareRef.delete();

  return NextResponse.json({ ok: true });
}
