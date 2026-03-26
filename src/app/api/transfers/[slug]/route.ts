import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { createNotification, getActorDisplayName } from "@/lib/notification-service";
import { hashSecret } from "@/lib/gallery-access";
import { NextResponse } from "next/server";
import { userCanManageTransfer } from "@/lib/transfer-team-access";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const doc = await db.collection("transfers").doc(slug).get();

  if (!doc.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const data = doc.data()!;
  if (!(await userCanManageTransfer(uid, data))) {
    return NextResponse.json({ error: "You can only delete transfers you created" }, { status: 403 });
  }

  const clientEmailRaw =
    typeof data?.clientEmail === "string"
      ? data.clientEmail.trim()
      : typeof data?.client_email === "string"
        ? data.client_email.trim()
        : "";
  const senderLabel = await getActorDisplayName(db, uid);

  await db.collection("transfers").doc(slug).delete();

  if (clientEmailRaw) {
    let recipientUid: string | null = null;
    try {
      const r = await getAdminAuth().getUserByEmail(clientEmailRaw.toLowerCase());
      if (r.uid && r.uid !== uid) recipientUid = r.uid;
    } catch {
      recipientUid = null;
    }
    if (recipientUid) {
      await createNotification({
        recipientUserId: recipientUid,
        actorUserId: uid,
        type: "transfer_deleted_by_sender",
        metadata: {
          actorDisplayName: senderLabel,
          transferSlug: slug,
          transferName: (data?.name as string) ?? "Transfer",
        },
      }).catch((err) => console.error("[transfers DELETE] notify:", err));
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const permission = body.permission as string | undefined;
  const expiresAt = body.expiresAt as string | null | undefined;
  const password = body.password as string | null | undefined;

  const updates: Record<string, unknown> = {};

  if (permission === "view" || permission === "downloadable") {
    updates.permission = permission;
  } else if (permission !== undefined) {
    return NextResponse.json(
      { error: "permission must be 'view' or 'downloadable'" },
      { status: 400 }
    );
  }

  if (expiresAt !== undefined) {
    updates.expires_at =
      expiresAt !== null && typeof expiresAt === "string" && expiresAt.trim()
        ? expiresAt.trim()
        : null;
    updates.expiry_warning_sent = false;
  }

  if (password !== undefined) {
    if (password !== null && typeof password === "string" && password.trim()) {
      updates.password_hash = await hashSecret(password.trim());
    } else {
      updates.password_hash = null;
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const docRef = db.collection("transfers").doc(slug);
  const doc = await docRef.get();

  if (!doc.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const data = doc.data()!;
  if (!(await userCanManageTransfer(uid, data))) {
    return NextResponse.json({ error: "You can only edit transfers you created" }, { status: 403 });
  }

  await docRef.update(updates);

  return NextResponse.json({ ok: true, ...updates });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const doc = await db.collection("transfers").doc(slug).get();

  if (!doc.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const data = doc.data();
  if (!data) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }

  const expiresAt = data.expires_at ?? null;
  const isExpired = expiresAt && new Date(expiresAt) < new Date();
  const status = isExpired ? "expired" : data.status ?? "active";

  const files = (data.files ?? []).map((f: Record<string, unknown>) => ({
    id: f.id,
    name: f.name,
    path: f.path,
    type: "file",
    views: f.views ?? 0,
    downloads: f.downloads ?? 0,
    backupFileId: f.backup_file_id ?? undefined,
    objectKey: f.object_key ?? undefined,
  }));

  return NextResponse.json({
    id: slug,
    slug,
    name: data.name,
    clientName: data.clientName,
    clientEmail: data.clientEmail ?? undefined,
    files,
    permission: data.permission ?? "downloadable",
    hasPassword: !!(data.password_hash ?? data.password),
    expiresAt: expiresAt ?? null,
    createdAt: data.created_at,
    status,
    organizationId: data.organization_id ?? null,
    personalTeamOwnerId: data.personal_team_owner_id ?? null,
  });
}
