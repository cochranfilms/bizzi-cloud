import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { canAccessBackupFileById } from "@/lib/file-access";
import { hashSecret } from "@/lib/gallery-access";
import { sendTransferEmailToClient } from "@/lib/emailjs";
import { createTransferNotification } from "@/lib/notification-service";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { dedupeIncomingTransferFiles } from "@/lib/transfer-resolve";
import { NextResponse } from "next/server";

async function requireAuthTransfer(
  request: Request
): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }
  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }
}

function transferDocToListItem(slug: string, data: Record<string, unknown>) {
  const expiresAt = data.expires_at ?? null;
  const isExpired = expiresAt && new Date(expiresAt as string) < new Date();
  const status = isExpired ? "expired" : ((data.status as string) ?? "active");
  const files = ((data.files as unknown[]) ?? []).map((raw) => {
    const f = raw as Record<string, unknown>;
    return {
    id: f.id as string,
    name: f.name as string,
    path: f.path as string,
    type: "file" as const,
    views: (f.views as number) ?? 0,
    downloads: (f.downloads as number) ?? 0,
    backupFileId: (f.backup_file_id as string) ?? undefined,
    objectKey: (f.object_key as string) ?? undefined,
    };
  });
  return {
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
    transferLifecycle: (data.transfer_lifecycle as string | undefined) ?? null,
  };
}

/** GET /api/transfers — list transfers for personal, personal_team, or enterprise workspace. */
export async function GET(request: Request) {
  const auth = await requireAuthTransfer(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const url = new URL(request.url);
  const context = url.searchParams.get("context") ?? "personal";
  const organizationId = url.searchParams.get("organization_id")?.trim() || null;
  const teamOwnerUserId = url.searchParams.get("team_owner_user_id")?.trim() || null;

  const db = getAdminFirestore();
  let docs: QueryDocumentSnapshot[];

  if (context === "enterprise" && organizationId) {
    const access = await resolveEnterpriseAccess(uid, organizationId);
    if (!access.canAccessEnterprise) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    const snap = await db.collection("transfers").where("user_id", "==", uid).get();
    docs = snap.docs.filter((d) => (d.data().organization_id as string | null) === organizationId);
  } else if (context === "personal_team" && teamOwnerUserId) {
    if (uid !== teamOwnerUserId) {
      const seatSnap = await db.collection("personal_team_seats").doc(`${teamOwnerUserId}_${uid}`).get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const snap = await db
      .collection("transfers")
      .where("personal_team_owner_id", "==", teamOwnerUserId)
      .get();
    docs = snap.docs.filter((d) => {
      const oid = d.data().organization_id;
      return oid === null || oid === undefined || oid === "";
    });
  } else {
    const snap = await db.collection("transfers").where("user_id", "==", uid).get();
    docs = snap.docs.filter((d) => {
      const row = d.data();
      const oid = row.organization_id;
      if (!(oid === null || oid === undefined || oid === "")) return false;
      const pto = row.personal_team_owner_id;
      return !(typeof pto === "string" && pto.trim() !== "");
    });
  }

  const items = docs
    .map((d) => transferDocToListItem(d.id, d.data() as Record<string, unknown>))
    .sort((a, b) => {
      const ca = new Date(a.createdAt as string).getTime();
      const cb = new Date(b.createdAt as string).getTime();
      return cb - ca;
    });

  return NextResponse.json({ transfers: items });
}

function generateSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateId(): string {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export async function POST(request: Request) {
  const auth = await requireAuthTransfer(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

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
    personal_team_owner_id?: string | null;
    /** When true, create an unpublished package (no email); add files via POST …/items then finalize. */
    draft?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    name,
    clientName,
    clientEmail,
    files: filesBody,
    permission,
    password,
    expiresAt,
    organizationId,
    personal_team_owner_id: rawPersonalTeamOwnerId,
    draft: draftRaw,
  } = body;

  const isDraft = draftRaw === true;

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!clientName || typeof clientName !== "string" || !clientName.trim()) {
    return NextResponse.json({ error: "clientName is required" }, { status: 400 });
  }

  const files = Array.isArray(filesBody) ? filesBody : [];
  if (!isDraft && files.length === 0) {
    return NextResponse.json({ error: "files array is required with at least one file" }, { status: 400 });
  }

  const filesDeduped = files.length > 0 ? dedupeIncomingTransferFiles(files) : [];
  if (!isDraft && filesDeduped.length === 0) {
    return NextResponse.json(
      { error: "files array must contain at least one unique file" },
      { status: 400 }
    );
  }
  /** Firestore batch limit is 500 ops (parent + items); keep headroom. */
  if (filesDeduped.length > 450) {
    return NextResponse.json(
      { error: "Maximum 450 files per transfer in one request" },
      { status: 400 }
    );
  }

  const slug = generateSlug();
  const now = new Date().toISOString();

  const transferFiles = filesDeduped.map((f) => ({
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

  const organizationIdToStore =
    typeof organizationId === "string" && organizationId.trim() ? organizationId.trim() : null;
  const db = getAdminFirestore();

  let personalTeamOwnerId: string | null = null;
  if (rawPersonalTeamOwnerId != null && typeof rawPersonalTeamOwnerId === "string") {
    const pto = rawPersonalTeamOwnerId.trim();
    if (pto) {
      if (organizationIdToStore) {
        return NextResponse.json(
          { error: "Team-scoped transfers cannot use an organization" },
          { status: 400 }
        );
      }
      personalTeamOwnerId = pto;
      if (uid !== pto) {
        const seatSnap = await db.collection("personal_team_seats").doc(`${pto}_${uid}`).get();
        const st = seatSnap.data()?.status as string | undefined;
        if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }
  }

  if (organizationIdToStore) {
    const access = await resolveEnterpriseAccess(uid, organizationIdToStore);
    if (!access.canAccessEnterprise) {
      logEnterpriseSecurityEvent("transfer_org_validation_failed", {
        uid,
        orgId: organizationIdToStore,
        reason: access.denialReason ?? "not_member",
      });
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    let userEmail: string | undefined;
    try {
      userEmail = (await getAdminAuth().getUser(uid)).email ?? undefined;
    } catch {
      userEmail = undefined;
    }

    for (const f of filesDeduped) {
      const bid =
        typeof f.backupFileId === "string" && f.backupFileId.trim()
          ? f.backupFileId.trim()
          : null;
      if (!bid) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationIdToStore,
          reason: "enterprise_transfer_requires_backupFileId_per_file",
        });
        return NextResponse.json(
          { error: "Each file must include backupFileId for organization transfers" },
          { status: 400 }
        );
      }
      const fileSnap = await db.collection("backup_files").doc(bid).get();
      if (!fileSnap.exists) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationIdToStore,
          fileId: bid,
          reason: "file_not_found",
        });
        return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
      }
      const fd = fileSnap.data() as Record<string, unknown>;
      if ((fd.organization_id as string | undefined) !== organizationIdToStore) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationIdToStore,
          fileId: bid,
          reason: "file_org_mismatch",
        });
        return NextResponse.json({ error: "File is not in this organization" }, { status: 403 });
      }
      if (!isBackupFileActiveForListing(fd)) {
        return NextResponse.json({ error: "File is not available for transfer" }, { status: 400 });
      }
      const allowed = await canAccessBackupFileById(uid, bid, userEmail);
      if (!allowed) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationIdToStore,
          fileId: bid,
          reason: "no_file_access",
        });
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const backupIdSet = [
    ...new Set(
      transferFiles.map((t) => t.backup_file_id).filter((id): id is string => typeof id === "string" && !!id)
    ),
  ];
  const metaById = new Map<string, Record<string, unknown>>();
  for (const bid of backupIdSet) {
    const s = await db.collection("backup_files").doc(bid).get();
    if (s.exists) metaById.set(bid, s.data() as Record<string, unknown>);
  }

  const correlationId = randomUUID();
  const transferRef = db.collection("transfers").doc(slug);

  const transferLifecycle = isDraft
    ? transferFiles.length > 0
      ? "uploading"
      : "draft"
    : "ready";
  const publishedAt = isDraft ? null : now;
  const metricsFinalizeCount = isDraft ? 0 : 1;

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
    transfer_lifecycle: transferLifecycle,
    published_at: publishedAt,
    notified_at: null as string | null,
    correlation_id: correlationId,
    item_count: transferFiles.length,
    uses_transfer_items: true,
    metrics_init_at: now,
    metrics_attach_count: transferFiles.length,
    metrics_last_attach_at: transferFiles.length > 0 ? now : null,
    metrics_finalize_count: metricsFinalizeCount,
    user_id: uid,
    organization_id: organizationIdToStore,
    personal_team_owner_id: personalTeamOwnerId,
  };

  const batch = db.batch();
  batch.set(transferRef, doc);
  transferFiles.forEach((f, i) => {
    const meta = f.backup_file_id ? metaById.get(f.backup_file_id) : undefined;
    const itemRef = transferRef.collection("items").doc(f.id);
    batch.set(itemRef, {
      sort_index: i,
      transfer_file_id: f.id,
      display_name: f.name,
      display_path: f.path,
      backup_file_id: f.backup_file_id,
      object_key: f.object_key,
      content_type: (meta?.content_type as string) ?? null,
      size_bytes: (meta?.size_bytes as number) ?? null,
      source_type: f.backup_file_id ? "existing_cloud" : "uploaded_for_transfer",
      item_status: "ready",
      views: 0,
      downloads: 0,
    });
  });
  await batch.commit();

  // Send email and create in-app notification when client email is provided (published transfers only)
  const clientEmailTrimmed = doc.clientEmail?.trim?.();
  if (!isDraft && clientEmailTrimmed) {
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

    try {
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
      ]);
      await transferRef.update({
        notified_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[transfers] Email/notification error:", err);
    }
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
    organizationId: organizationIdToStore,
    personalTeamOwnerId,
    transferLifecycle: doc.transfer_lifecycle,
    draft: isDraft,
  });
}
