import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { hashSecret } from "@/lib/gallery-access";
import { sendTransferEmailToClient } from "@/lib/emailjs";
import { createTransferNotification } from "@/lib/notification-service";
import { NextResponse } from "next/server";

function generateSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateId(): string {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: Request) {
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

  let body: {
    name?: string;
    clientName?: string;
    clientEmail?: string;
    files?: Array<{
      name: string;
      path: string;
      type: "file";
      backupFileId?: string;
      objectKey?: string;
    }>;
    permission?: "view" | "downloadable";
    password?: string | null;
    expiresAt?: string | null;
    organizationId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, clientName, clientEmail, files, permission, password, expiresAt, organizationId } = body;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
    return NextResponse.json({ error: "clientName is required" }, { status: 400 });
  }
  if (!files || !Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: "files array is required with at least one file" }, { status: 400 });
  }

  const slug = generateSlug();
  const now = new Date().toISOString();

  const transferFiles = files.map((f) => ({
    id: generateId(),
    name: f.name,
    path: f.path,
    type: "file" as const,
    views: 0,
    downloads: 0,
    backup_file_id: f.backupFileId ?? null,
    object_key: f.objectKey ?? null,
  }));

  let password_hash: string | null = null;
  if (password && typeof password === "string" && password.trim()) {
    password_hash = await hashSecret(password.trim());
  }

  const doc = {
    slug,
    name: name.trim(),
    clientName: clientName.trim(),
    clientEmail: typeof clientEmail === "string" ? clientEmail.trim() || null : null,
    files: transferFiles,
    permission: permission === "view" ? "view" : "downloadable",
    password_hash,
    expires_at: expiresAt && typeof expiresAt === "string" && expiresAt.trim()
      ? expiresAt.trim()
      : null,
    created_at: now,
    status: "active",
    user_id: uid,
    organization_id: organizationId ?? null,
  };

  const db = getAdminFirestore();
  await db.collection("transfers").doc(slug).set(doc);

  // Send email and create in-app notification when client email is provided
  const clientEmailTrimmed = doc.clientEmail?.trim?.();
  if (clientEmailTrimmed) {
    let actorDisplayName: string;
    try {
      const profileSnap = await db.collection("profiles").doc(uid).get();
      actorDisplayName = (profileSnap.data()?.displayName as string)?.trim();
      if (!actorDisplayName) {
        const authUser = await getAdminAuth().getUser(uid);
        actorDisplayName =
          (authUser.displayName as string)?.trim() ??
          authUser.email?.split("@")[0] ??
          "Someone";
      } else {
        actorDisplayName = actorDisplayName || "Someone";
      }
    } catch {
      actorDisplayName = "Someone";
    }

    const fileNames = transferFiles.map((f) => f.name);

    await Promise.all([
      sendTransferEmailToClient({
        clientEmail: clientEmailTrimmed,
        sharedByUserId: uid,
        actorDisplayName,
        transferName: doc.name,
        transferSlug: slug,
        fileNames,
      }),
      createTransferNotification({
        clientEmail: clientEmailTrimmed,
        sharedByUserId: uid,
        actorDisplayName,
        transferSlug: slug,
        transferName: doc.name,
        fileCount: transferFiles.length,
      }),
    ]).catch((err) => {
      console.error("[transfers] Email/notification error:", err);
    });
  }

  return NextResponse.json({
    slug,
    id: slug,
    name: doc.name,
    clientName: doc.clientName,
    clientEmail: doc.clientEmail,
    files: transferFiles.map((f) => ({ ...f, backupFileId: f.backup_file_id, objectKey: f.object_key })),
    permission: doc.permission,
    hasPassword: !!password_hash,
    expiresAt: doc.expires_at,
    createdAt: doc.created_at,
    status: doc.status,
  });
}
