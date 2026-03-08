import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { generateShareToken } from "@/lib/share-token";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const url = new URL(request.url);
  const linkedDriveIdParam = url.searchParams.get("linked_drive_id");
  const backupFileIdParam = url.searchParams.get("backup_file_id");

  const db = getAdminFirestore();

  // Get existing share for a specific drive or file (for ShareModal get-or-create)
  if (linkedDriveIdParam) {
    let existingSnap;
    if (backupFileIdParam) {
      existingSnap = await db
        .collection("folder_shares")
        .where("owner_id", "==", uid)
        .where("linked_drive_id", "==", linkedDriveIdParam)
        .where("backup_file_id", "==", backupFileIdParam)
        .limit(1)
        .get();
    } else {
      existingSnap = await db
        .collection("folder_shares")
        .where("owner_id", "==", uid)
        .where("linked_drive_id", "==", linkedDriveIdParam)
        .where("backup_file_id", "==", null)
        .limit(1)
        .get();
    }

    if (existingSnap.empty) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const d = existingSnap.docs[0];
    const data = d.data();
    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ error: "Share expired" }, { status: 404 });
    }

    return NextResponse.json({
      token: data.token,
      share_url: `/s/${data.token}`,
      access_level: data.access_level ?? "public",
      permission: data.permission ?? "view",
      invited_emails: data.invited_emails ?? [],
      linked_drive_id: data.linked_drive_id,
      backup_file_id: data.backup_file_id ?? null,
    });
  }

  // Shares I created (owner)
  const ownedSnap = await db
    .collection("folder_shares")
    .where("owner_id", "==", uid)
    .orderBy("created_at", "desc")
    .get();

  type ShareItem = {
    id: string;
    token: string;
    linked_drive_id: string;
    folder_name: string;
    item_type: "file" | "folder";
    permission: string;
    created_at: string;
    share_url: string;
    sharedBy?: string;
  };

  const owned: ShareItem[] = [];

  for (const d of ownedSnap.docs) {
    const data = d.data();
    const referencedFileIds = data.referenced_file_ids as string[] | undefined;
    const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;

    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) continue;

    // Show all owned shares immediately (including before inviting anyone)
    let itemName: string;
    let itemType: "file" | "folder";

    if (isVirtualShare) {
      itemName = (data.folder_name as string) ?? "Shared folder";
      itemType = "folder";
      owned.push({
        id: d.id,
        token: data.token as string,
        linked_drive_id: "",
        folder_name: itemName,
        item_type: itemType,
        permission: (data.permission as string) ?? "view",
        created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        share_url: `/s/${data.token}`,
      });
      continue;
    }

    const driveId = data.linked_drive_id as string;
    const backupFileId = data.backup_file_id as string | null | undefined;
    const isFileShare = !!backupFileId;

    const driveSnap = await db.collection("linked_drives").doc(driveId).get();

    // Skip if drive was deleted
    if (!driveSnap.exists) continue;

    if (isFileShare) {
      const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
      if (!fileSnap.exists) continue;
      const fileData = fileSnap.data();
      if (fileData?.deleted_at) continue;
      const path = (fileData?.relative_path ?? "") as string;
      itemName = path.split("/").filter(Boolean).pop() ?? path ?? "File";
      itemType = "file";
    } else {
      itemName = driveSnap.data()?.name ?? "Folder";
      itemType = "folder";
    }

    owned.push({
      id: d.id,
      token: data.token as string,
      linked_drive_id: driveId,
      folder_name: itemName,
      item_type: itemType,
      permission: (data.permission as string) ?? "view",
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      share_url: `/s/${data.token}`,
    });
  }

  // Shares shared with me (invited by email)
  const invited: ShareItem[] = [];
  if (email) {
    const invitedSnap = await db
      .collection("folder_shares")
      .where("invited_emails", "array-contains", email)
      .get();

    for (const d of invitedSnap.docs) {
      const data = d.data();
      if (data.owner_id === uid) continue; // already in owned
      const driveId = data.linked_drive_id as string;
      const backupFileId = data.backup_file_id as string | null | undefined;
      const isFileShare = !!backupFileId;

      const driveSnap = await db.collection("linked_drives").doc(driveId).get();

      // Skip if drive was deleted by owner
      if (!driveSnap.exists) continue;

      const expiresAt = data.expires_at?.toDate?.();
      if (expiresAt && expiresAt < new Date()) continue;

      // Invited list is already filtered by array-contains email; if owner removed
      // this user, they won't be in invited_emails and won't appear here.

      let itemName: string;
      if (isFileShare) {
        const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
        if (!fileSnap.exists) continue;
        const fileData = fileSnap.data();
        if (fileData?.deleted_at) continue;
        const path = (fileData?.relative_path ?? "") as string;
        itemName = path.split("/").filter(Boolean).pop() ?? path ?? "File";
      } else {
        itemName = driveSnap.data()?.name ?? "Folder";
      }

      const ownerSnap = await db
        .collection("profiles")
        .doc(data.owner_id as string)
        .get();
      const sharedBy =
        ownerSnap.exists && ownerSnap.data()?.displayName
          ? ownerSnap.data()?.displayName
          : ownerSnap.exists && ownerSnap.data()?.email
            ? ownerSnap.data()?.email
            : "Unknown";

      invited.push({
        id: d.id,
        token: data.token as string,
        linked_drive_id: driveId,
        folder_name: itemName,
        item_type: isFileShare ? "file" : "folder",
        permission: (data.permission as string) ?? "view",
        created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
        share_url: `/s/${data.token}`,
        sharedBy,
      });
    }
  }

  return NextResponse.json({
    owned,
    invited,
  });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const {
    linked_drive_id: linkedDriveId,
    backup_file_id: backupFileId,
    permission = "view",
    access_level = "private",
    expires_at: expiresAt,
    invited_emails: invitedEmails,
    referenced_file_ids: referencedFileIds,
    folder_name: folderName,
  } = body;

  const isVirtualShare =
    Array.isArray(referencedFileIds) &&
    referencedFileIds.length > 0 &&
    typeof folderName === "string" &&
    folderName.trim().length > 0;

  if (!isVirtualShare && (!linkedDriveId || typeof linkedDriveId !== "string")) {
    return NextResponse.json(
      { error: "linked_drive_id is required, or referenced_file_ids + folder_name for virtual share" },
      { status: 400 }
    );
  }

  if (permission !== "view" && permission !== "edit") {
    return NextResponse.json(
      { error: "permission must be 'view' or 'edit'" },
      { status: 400 }
    );
  }

  if (access_level !== "private" && access_level !== "public") {
    return NextResponse.json(
      { error: "access_level must be 'private' or 'public'" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  if (isVirtualShare) {
    // Virtual share: reference files by ID only; no linked_drive created.
    // Files remain in their original locations. Deleting this share only removes
    // the folder_shares doc—backup_files (originals) are never touched.
    const fileIds = (referencedFileIds as string[]).filter(
      (id): id is string => typeof id === "string" && id.length > 0
    );
    const uniqueIds = [...new Set(fileIds)];
    if (uniqueIds.length === 0) {
      return NextResponse.json(
        { error: "referenced_file_ids must contain at least one file id" },
        { status: 400 }
      );
    }

    for (const fileId of uniqueIds) {
      const fileSnap = await db.collection("backup_files").doc(fileId).get();
      if (!fileSnap.exists) {
        return NextResponse.json({ error: `File ${fileId} not found` }, { status: 404 });
      }
      const fileData = fileSnap.data();
      if (fileData?.userId !== uid) {
        return NextResponse.json({ error: "Access denied: you do not own all files" }, { status: 403 });
      }
      if (fileData?.deleted_at) {
        return NextResponse.json({ error: "Cannot share deleted file" }, { status: 400 });
      }
    }

    const shareToken = generateShareToken();
    const now = new Date();

    const shareData = {
      token: shareToken,
      owner_id: uid,
      referenced_file_ids: uniqueIds,
      folder_name: folderName.trim(),
      permission: permission as "view" | "edit",
      access_level: access_level as "private" | "public",
      expires_at: expiresAt && typeof expiresAt === "string" ? new Date(expiresAt) : null,
      created_at: now,
      invited_emails: Array.isArray(invitedEmails)
        ? invitedEmails.filter((e: unknown) => typeof e === "string")
        : [],
    };

    await db.collection("folder_shares").doc(shareToken).set(shareData);

    return NextResponse.json({
      token: shareToken,
      share_url: `/s/${shareToken}`,
      existing: false,
      access_level: shareData.access_level,
      permission: shareData.permission,
      invited_emails: shareData.invited_emails,
    });
  }

  // Standard share: linked_drive_id based
  const driveSnap = await db
    .collection("linked_drives")
    .doc(linkedDriveId)
    .get();

  if (!driveSnap.exists) {
    return NextResponse.json({ error: "Drive not found" }, { status: 404 });
  }

  const driveData = driveSnap.data();
  const driveUserId = driveData?.userId ?? driveData?.user_id;
  if (driveUserId !== uid) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  let backupFileIdToStore: string | null = null;
  if (backupFileId && typeof backupFileId === "string") {
    const fileSnap = await db.collection("backup_files").doc(backupFileId).get();
    if (!fileSnap.exists) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    const fileData = fileSnap.data();
    if (fileData?.userId !== uid) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    if (fileData?.linked_drive_id !== linkedDriveId) {
      return NextResponse.json({ error: "File is not in this drive" }, { status: 400 });
    }
    if (fileData?.deleted_at) {
      return NextResponse.json({ error: "Cannot share deleted file" }, { status: 400 });
    }
    backupFileIdToStore = backupFileId;
  }

  // Get-or-create: check for existing share
  let existingDoc: { data: () => Record<string, unknown> } | null = null;
  if (backupFileIdToStore) {
    const snap = await db
      .collection("folder_shares")
      .where("owner_id", "==", uid)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("backup_file_id", "==", backupFileIdToStore)
      .limit(1)
      .get();
    if (!snap.empty) existingDoc = snap.docs[0];
  } else {
    const snap = await db
      .collection("folder_shares")
      .where("owner_id", "==", uid)
      .where("linked_drive_id", "==", linkedDriveId)
      .get();
    const folderShare = snap.docs.find((d) => !d.data().backup_file_id);
    if (folderShare) existingDoc = folderShare;
  }

  if (existingDoc) {
    const data = existingDoc.data();
    const shareToken = data.token as string;
    return NextResponse.json({
      token: shareToken,
      share_url: `/s/${shareToken}`,
      existing: true,
    });
  }

  const shareToken = generateShareToken();
  const now = new Date();

  const shareData = {
    token: shareToken,
    owner_id: uid,
    linked_drive_id: linkedDriveId,
    backup_file_id: backupFileIdToStore,
    permission: permission as "view" | "edit",
    access_level: access_level as "private" | "public",
    expires_at: expiresAt && typeof expiresAt === "string" ? new Date(expiresAt) : null,
    created_at: now,
    invited_emails: Array.isArray(invitedEmails)
      ? invitedEmails.filter((e: unknown) => typeof e === "string")
      : [],
  };

  await db.collection("folder_shares").doc(shareToken).set(shareData);

  return NextResponse.json({
    token: shareToken,
    share_url: `/s/${shareToken}`,
    existing: false,
  });
}
