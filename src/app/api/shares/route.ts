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

  const db = getAdminFirestore();

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
    permission: string;
    created_at: string;
    share_url: string;
    sharedBy?: string;
  };

  const owned: ShareItem[] = [];

  for (const d of ownedSnap.docs) {
    const data = d.data();
    const driveId = data.linked_drive_id as string;
    const driveSnap = await db.collection("linked_drives").doc(driveId).get();
    const folderName = driveSnap.exists
      ? (driveSnap.data()?.name ?? "Folder")
      : "Folder";
    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) continue;

    owned.push({
      id: d.id,
      token: data.token as string,
      linked_drive_id: driveId,
      folder_name: folderName,
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
      const driveSnap = await db.collection("linked_drives").doc(driveId).get();
      const folderName = driveSnap.exists
        ? (driveSnap.data()?.name ?? "Folder")
        : "Folder";
      const expiresAt = data.expires_at?.toDate?.();
      if (expiresAt && expiresAt < new Date()) continue;

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
        folder_name: folderName,
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
    permission = "view",
    expires_at: expiresAt,
    invited_emails: invitedEmails,
  } = body;

  if (!linkedDriveId || typeof linkedDriveId !== "string") {
    return NextResponse.json(
      { error: "linked_drive_id is required" },
      { status: 400 }
    );
  }

  if (permission !== "view" && permission !== "edit") {
    return NextResponse.json(
      { error: "permission must be 'view' or 'edit'" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  // Verify user owns the linked drive
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

  const shareToken = generateShareToken();
  const now = new Date();

  const shareData = {
    token: shareToken,
    owner_id: uid,
    linked_drive_id: linkedDriveId,
    permission: permission as "view" | "edit",
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
  });
}
