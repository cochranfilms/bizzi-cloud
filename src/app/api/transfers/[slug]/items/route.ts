import { randomUUID } from "crypto";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { canAccessBackupFileById } from "@/lib/file-access";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";
import { dedupeIncomingTransferFiles } from "@/lib/transfer-resolve";
import { resolveBackupFileIdForTransferAttachment } from "@/lib/transfer-storage-package";
import { userCanManageTransfer } from "@/lib/transfer-team-access";
import { NextResponse } from "next/server";

function generateId(): string {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const ATTACHABLE = new Set(["draft", "uploading", "finalizing"]);

/** POST /api/transfers/{slug}/items — append files to an unpublished transfer (draft / uploading). */
export async function POST(
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

  let body: {
    items?: Array<{
      name: string;
      path: string;
      type?: "file";
      backupFileId?: string;
      objectKey?: string;
    }>;
    correlation_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawItems = body.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }

  const deduped = dedupeIncomingTransferFiles(
    rawItems.map((r) => ({
      name: r.name,
      path: r.path,
      backupFileId: r.backupFileId,
      objectKey: r.objectKey,
    }))
  );

  if (deduped.length === 0) {
    return NextResponse.json({ error: "No unique items to attach" }, { status: 400 });
  }
  if (deduped.length > 450) {
    return NextResponse.json(
      { error: "Maximum 450 files per attach batch" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("transfers").doc(slug);
  const pre = await ref.get();
  if (!pre.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }
  const parent = pre.data()!;
  if (!(await userCanManageTransfer(uid, parent))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const lifecycleRaw = parent.transfer_lifecycle as string | undefined;
  if (lifecycleRaw === undefined) {
    return NextResponse.json(
      { error: "This transfer cannot accept new items" },
      { status: 409 }
    );
  }
  if (!ATTACHABLE.has(lifecycleRaw)) {
    return NextResponse.json(
      { error: "This transfer cannot accept new items" },
      { status: 409 }
    );
  }

  const organizationIdToStore =
    typeof parent.organization_id === "string" && parent.organization_id.trim()
      ? parent.organization_id.trim()
      : null;

  let userEmail: string | undefined;
  try {
    userEmail = (await getAdminAuth().getUser(uid)).email ?? undefined;
  } catch {
    userEmail = undefined;
  }

  if (organizationIdToStore) {
    const access = await resolveEnterpriseAccess(uid, organizationIdToStore);
    if (!access.canAccessEnterprise) {
      logEnterpriseSecurityEvent("transfer_org_validation_failed", {
        uid,
        orgId: organizationIdToStore,
        reason: "attach_items_not_member",
      });
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }

    for (const f of deduped) {
      const bid =
        typeof f.backupFileId === "string" && f.backupFileId.trim()
          ? f.backupFileId.trim()
          : null;
      if (!bid) {
        return NextResponse.json(
          { error: "Each item must include backupFileId for organization transfers" },
          { status: 400 }
        );
      }
      const fileSnap = await db.collection("backup_files").doc(bid).get();
      if (!fileSnap.exists) {
        return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
      }
      const fd = fileSnap.data() as Record<string, unknown>;
      if ((fd.organization_id as string | undefined) !== organizationIdToStore) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationIdToStore,
          fileId: bid,
          reason: "attach_file_org_mismatch",
        });
        return NextResponse.json({ error: "File is not in this organization" }, { status: 403 });
      }
      if (!isBackupFileActiveForListing(fd)) {
        return NextResponse.json({ error: "File is not available for transfer" }, { status: 400 });
      }
      const allowed = await canAccessBackupFileById(uid, bid, userEmail);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  } else {
    for (const f of deduped) {
      const bid =
        typeof f.backupFileId === "string" && f.backupFileId.trim()
          ? f.backupFileId.trim()
          : null;
      if (!bid) {
        return NextResponse.json(
          { error: "Each item must include backupFileId" },
          { status: 400 }
        );
      }
      const fileSnap = await db.collection("backup_files").doc(bid).get();
      if (!fileSnap.exists) {
        return NextResponse.json({ error: "Invalid file reference" }, { status: 400 });
      }
      const fd = fileSnap.data() as Record<string, unknown>;
      if (!isBackupFileActiveForListing(fd)) {
        return NextResponse.json({ error: "File is not available for transfer" }, { status: 400 });
      }
      const allowed = await canAccessBackupFileById(uid, bid, userEmail);
      if (!allowed) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const existing = ((parent.files as unknown[]) ?? []).map((raw) => raw as Record<string, unknown>);
  const seenBid = new Set(
    existing
      .map((e) => e.backup_file_id)
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
  );
  const seenPathName = new Set(
    existing.map((e) => `${String(e.path ?? "")}::${String(e.name ?? "")}`)
  );

  const toAdd = deduped.filter((f) => {
    const bid =
      typeof f.backupFileId === "string" && f.backupFileId.trim() ? f.backupFileId.trim() : "";
    const pn = `${f.path}::${f.name}`;
    if (bid) {
      if (seenBid.has(bid)) return false;
      seenBid.add(bid);
      return true;
    }
    if (seenPathName.has(pn)) return false;
    seenPathName.add(pn);
    return true;
  });

  if (toAdd.length === 0) {
    return NextResponse.json({
      ok: true,
      attached: 0,
      item_count: (parent.item_count as number) ?? existing.length,
    });
  }

  const now = new Date().toISOString();
  const sortStart = existing.length;

  const newRows: Array<{
    id: string;
    name: string;
    path: string;
    type: "file";
    views: number;
    downloads: number;
    backup_file_id: string;
    object_key: string | null;
  }> = [];
  const metaById = new Map<string, Record<string, unknown>>();
  for (const f of toAdd) {
    const rawBid = f.backupFileId!.trim();
    const resolved = await resolveBackupFileIdForTransferAttachment(
      db,
      uid,
      ref,
      parent as Record<string, unknown>,
      slug,
      rawBid
    );
    newRows.push({
      id: generateId(),
      name: resolved.name || f.name,
      path: resolved.displayPath,
      type: "file",
      views: 0,
      downloads: 0,
      backup_file_id: resolved.backupFileId,
      object_key: resolved.objectKey ?? f.objectKey ?? null,
    });
    const s = await db.collection("backup_files").doc(resolved.backupFileId).get();
    if (s.exists) metaById.set(resolved.backupFileId, s.data() as Record<string, unknown>);
  }

  const updatedFiles = [
    ...existing.map((e) => ({
      id: e.id as string,
      name: e.name as string,
      path: e.path as string,
      type: "file" as const,
      views: (e.views as number) ?? 0,
      downloads: (e.downloads as number) ?? 0,
      backup_file_id: (e.backup_file_id as string | null) ?? null,
      object_key: (e.object_key as string | null) ?? null,
    })),
    ...newRows,
  ];

  const correlationAttach = randomUUID();
  const metricsAttachCount = ((parent.metrics_attach_count as number) ?? 0) + newRows.length;

  const batch = db.batch();
  newRows.forEach((f, i) => {
    const meta = f.backup_file_id ? metaById.get(f.backup_file_id) : undefined;
    const itemRef = ref.collection("items").doc(f.id);
    batch.set(itemRef, {
      sort_index: sortStart + i,
      transfer_file_id: f.id,
      display_name: f.name,
      display_path: f.path,
      backup_file_id: f.backup_file_id,
      object_key: f.object_key,
      content_type: (meta?.content_type as string) ?? null,
      size_bytes: (meta?.size_bytes as number) ?? null,
      source_type: "existing_cloud",
      item_status: "ready",
      views: 0,
      downloads: 0,
      correlation_attach_id: correlationAttach,
    });
  });

  batch.update(ref, {
    files: updatedFiles,
    item_count: updatedFiles.length,
    transfer_lifecycle: lifecycleRaw === "draft" ? "uploading" : lifecycleRaw,
    metrics_attach_count: metricsAttachCount,
    metrics_last_attach_at: now,
    updated_at: now,
  });

  await batch.commit();

  return NextResponse.json({
    ok: true,
    attached: newRows.length,
    item_count: updatedFiles.length,
    correlation_attach_id: correlationAttach,
  });
}
