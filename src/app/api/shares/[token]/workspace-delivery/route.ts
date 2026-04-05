import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { createWorkspaceShareNotifications, getActorDisplayName } from "@/lib/notification-service";
import { NextResponse } from "next/server";
import {
  getRecipientModeFromDoc,
  getWorkspaceShareDeliveryStatus,
  parseWorkspaceTargetKey,
  userIsWorkspaceShareTargetAdmin,
  workspaceDisplayContextForShare,
  workspaceTargetKey,
} from "@/lib/folder-share-workspace";

function workspaceShareInboxLabel(kind: import("@/types/folder-share").WorkspaceShareTargetKind): string {
  return kind === "personal_team" ? "Personal team · Shared tab" : "Org · Shared tab";
}

/**
 * Approve or reject delivery of a workspace-targeted share into the team/org inbox.
 * Only organization admins or personal team owners may update.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!bearer) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(bearer);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { token: shareToken } = await params;
  if (!shareToken?.trim()) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action as string | undefined;
  const rejectReason =
    typeof body?.reject_reason === "string" ? body.reject_reason.trim().slice(0, 500) : "";

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json(
      { error: "action must be 'approve' or 'reject'" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection("folder_shares").doc(shareToken);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = snap.data()!;
  if (getRecipientModeFromDoc(share as Record<string, unknown>) !== "workspace") {
    return NextResponse.json({ error: "Not a workspace-targeted share" }, { status: 400 });
  }

  const delivery = getWorkspaceShareDeliveryStatus(share as Record<string, unknown>);
  if (delivery !== "pending") {
    return NextResponse.json(
      { error: "Share delivery is not pending moderation" },
      { status: 409 }
    );
  }

  const wt = share.workspace_target as { kind?: string; id?: string } | undefined;
  if (!wt?.kind || !wt?.id || (wt.kind !== "enterprise_workspace" && wt.kind !== "personal_team")) {
    return NextResponse.json({ error: "Invalid workspace target" }, { status: 400 });
  }
  const kind = wt.kind as import("@/types/folder-share").WorkspaceShareTargetKind;
  const targetId = wt.id.trim();

  const allowed = await userIsWorkspaceShareTargetAdmin(uid, kind, targetId);
  if (!allowed) {
    return NextResponse.json({ error: "Only a workspace admin can moderate this share" }, { status: 403 });
  }

  const now = new Date();

  if (action === "reject") {
    await ref.update({
      workspace_delivery_status: "rejected",
      workspace_delivery_resolved_at: now,
      workspace_delivery_resolved_by: uid,
      ...(rejectReason ? { workspace_delivery_reject_reason: rejectReason } : {}),
    });
    return NextResponse.json({ ok: true, workspace_delivery_status: "rejected" });
  }

  await ref.update({
    workspace_delivery_status: "approved",
    workspace_delivery_resolved_at: now,
    workspace_delivery_resolved_by: uid,
  });

  const ownerId = share.owner_id as string;
  const referencedFileIds = share.referenced_file_ids as string[] | undefined;
  const backupFileId = share.backup_file_id as string | undefined;
  const fileIds =
    Array.isArray(referencedFileIds) && referencedFileIds.length > 0
      ? referencedFileIds
      : backupFileId
        ? [backupFileId]
        : [];
  const folderName = (share.folder_name as string) ?? "Shared folder";
  const shareSourceFromDoc = share.share_ui_origin as string | undefined;
  const shareSourceLabel =
    shareSourceFromDoc === "enterprise"
      ? "From org workspace"
      : shareSourceFromDoc === "personal_team"
        ? "From team workspace"
        : "From your files";

  const ctx = await workspaceDisplayContextForShare(db, kind, targetId);
  const key = workspaceTargetKey(kind, targetId);

  await createWorkspaceShareNotifications({
    sharedByUserId: ownerId,
    actorDisplayName: await getActorDisplayName(db, ownerId),
    fileIds,
    folderShareId: shareToken,
    folderName,
    workspaceShareName: ctx.name,
    workspaceTargetKey: key,
    kind,
    targetId,
    shareInboxScopeLabel: workspaceShareInboxLabel(kind),
    shareSourceLabel,
    targetOrganizationId: ctx.organizationId,
  });

  return NextResponse.json({ ok: true, workspace_delivery_status: "approved" });
}
