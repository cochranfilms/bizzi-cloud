import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { logActivityEvent } from "@/lib/activity-log";
import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { generateShareToken } from "@/lib/share-token";
import {
  createShareNotifications,
  createWorkspaceShareNotifications,
} from "@/lib/notification-service";
import {
  sendShareFileEmailsToInvitees,
  sendWorkspaceShareAdminNotificationEmail,
} from "@/lib/emailjs";
import { NextResponse } from "next/server";
import { hydrateFolderShareDoc } from "@/lib/folder-share-hydrate";
import {
  getEnterpriseOrgPrimaryAdminEmail,
  getRecipientModeFromDoc,
  parseWorkspaceTargetKey,
  userCanAccessWorkspaceShareTarget,
  workspaceTargetKey,
} from "@/lib/folder-share-workspace";
import { getAccessibleWorkspaceIds } from "@/lib/workspace-access";
import { PERSONAL_TEAM_SETTINGS_COLLECTION } from "@/lib/personal-team-constants";
import type { WorkspaceShareTargetKind } from "@/types/folder-share";
import type { WorkspaceType } from "@/types/workspace";

function scopeLabelForWorkspaceType(t: WorkspaceType): string {
  switch (t) {
    case "org_shared":
      return "Organization";
    case "team":
      return "Team";
    case "project":
      return "Project";
    case "gallery":
      return "Gallery";
    case "private":
      return "Private";
    default:
      return "Workspace";
  }
}

async function workspaceDisplayContext(
  db: Firestore,
  kind: WorkspaceShareTargetKind,
  targetId: string
): Promise<{ name: string; scopeLabel: string; organizationId: string | null }> {
  if (kind === "personal_team") {
    const settings = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(targetId).get();
    const custom = (settings.data()?.team_name as string | undefined)?.trim();
    if (custom) return { name: custom, scopeLabel: "Team", organizationId: null };
    try {
      const authUser = await getAdminAuth().getUser(targetId);
      const label = (authUser.displayName?.trim() || authUser.email?.split("@")[0] || "Team").trim();
      return { name: `${label}'s team`, scopeLabel: "Team", organizationId: null };
    } catch {
      return { name: "Team workspace", scopeLabel: "Team", organizationId: null };
    }
  }
  const wsSnap = await db.collection("workspaces").doc(targetId).get();
  if (!wsSnap.exists) {
    return { name: "Workspace", scopeLabel: "Workspace", organizationId: null };
  }
  const ws = wsSnap.data()!;
  const orgId = ws.organization_id as string;
  const wsType = (ws.workspace_type as WorkspaceType) ?? "private";
  return {
    name: ((ws.name as string) ?? "Workspace").trim() || "Workspace",
    scopeLabel: scopeLabelForWorkspaceType(wsType),
    organizationId: orgId ?? null,
  };
}

async function resolveActorDisplayNameForShare(
  uid: string,
  authEmail: string | undefined
): Promise<string> {
  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(uid).get();
  const fromProfile = (profileSnap.data()?.displayName as string | undefined)?.trim();
  if (fromProfile) return fromProfile;
  try {
    const authUser = await getAdminAuth().getUser(uid);
    return (
      (authUser.displayName as string | undefined)?.trim() ??
      authEmail?.split("@")[0] ??
      authUser.email?.split("@")[0] ??
      "Someone"
    );
  } catch {
    return authEmail?.split("@")[0] ?? "Someone";
  }
}

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof process.env.VERCEL_URL === "string" && process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL}`;
  return "https://www.bizzicloud.io";
}

async function deliverShareNotificationsAndEmail(params: {
  db: Firestore;
  uid: string;
  email: string | undefined;
  recipientMode: "email" | "workspace";
  workspaceKind: WorkspaceShareTargetKind | null;
  workspaceTargetId: string | null;
  shareToken: string;
  folderName: string;
  fileIds: string[];
  invitedEmails: string[];
  permission: string;
}): Promise<void> {
  const actorDisplayName = await resolveActorDisplayNameForShare(params.uid, params.email);
  if (params.recipientMode === "email" && params.invitedEmails.length > 0) {
    await Promise.all([
      createShareNotifications({
        sharedByUserId: params.uid,
        actorDisplayName,
        actorEmail: params.email ?? undefined,
        fileIds: params.fileIds,
        folderShareId: params.shareToken,
        permission: params.permission,
        invitedEmails: params.invitedEmails,
        folderName: params.folderName,
      }),
      sendShareFileEmailsToInvitees({
        invitedEmails: params.invitedEmails,
        sharedByUserId: params.uid,
        actorDisplayName,
        fileIds: params.fileIds,
        folderName: params.folderName,
        shareToken: params.shareToken,
      }),
    ]);
    return;
  }

  if (
    params.recipientMode === "workspace" &&
    params.workspaceKind &&
    params.workspaceTargetId
  ) {
    const ctx = await workspaceDisplayContext(
      params.db,
      params.workspaceKind,
      params.workspaceTargetId
    );
    await createWorkspaceShareNotifications({
      sharedByUserId: params.uid,
      actorDisplayName,
      fileIds: params.fileIds,
      folderShareId: params.shareToken,
      folderName: params.folderName,
      workspaceShareName: ctx.name,
      workspaceTargetKey: workspaceTargetKey(params.workspaceKind, params.workspaceTargetId),
      kind: params.workspaceKind,
      targetId: params.workspaceTargetId,
    });
    let adminEmail: string | null = null;
    if (params.workspaceKind === "enterprise_workspace" && ctx.organizationId) {
      adminEmail = await getEnterpriseOrgPrimaryAdminEmail(ctx.organizationId);
    } else if (params.workspaceKind === "personal_team") {
      try {
        adminEmail = (await getAdminAuth().getUser(params.workspaceTargetId)).email ?? null;
      } catch {
        adminEmail = null;
      }
    }
    const base = appBaseUrl();
    const ctaUrl =
      params.workspaceKind === "personal_team"
        ? `${base}/team/${params.workspaceTargetId}/shared`
        : `${base}/enterprise/shared`;
    await sendWorkspaceShareAdminNotificationEmail({
      toEmail: adminEmail,
      sharedByUserId: params.uid,
      actorDisplayName,
      fileIds: params.fileIds,
      folderName: params.folderName,
      shareToken: params.shareToken,
      scopeLabel: ctx.scopeLabel,
      workspaceName: ctx.name,
      ctaUrl,
    });
  }
}

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
  const shareRecipientParam = (url.searchParams.get("share_recipient") ?? "email").trim();
  const workspaceKindParam = url.searchParams.get("workspace_kind") as WorkspaceShareTargetKind | null;
  const workspaceIdParam = url.searchParams.get("workspace_id")?.trim() || null;

  const db = getAdminFirestore();

  try {
  // Get existing share for a specific drive or file (for ShareModal get-or-create)
  if (linkedDriveIdParam) {
    let existingSnap;
    if (backupFileIdParam) {
      existingSnap = await db
        .collection("folder_shares")
        .where("owner_id", "==", uid)
        .where("linked_drive_id", "==", linkedDriveIdParam)
        .where("backup_file_id", "==", backupFileIdParam)
        .get();
    } else {
      existingSnap = await db
        .collection("folder_shares")
        .where("owner_id", "==", uid)
        .where("linked_drive_id", "==", linkedDriveIdParam)
        .where("backup_file_id", "==", null)
        .get();
    }

    if (existingSnap.empty) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const wantWorkspace =
      shareRecipientParam === "workspace" &&
      workspaceKindParam &&
      (workspaceKindParam === "enterprise_workspace" || workspaceKindParam === "personal_team") &&
      workspaceIdParam;
    const wantKey = wantWorkspace
      ? workspaceTargetKey(workspaceKindParam!, workspaceIdParam!)
      : null;

    let d: QueryDocumentSnapshot | undefined;
    if (wantKey) {
      d = existingSnap.docs.find((doc) => (doc.data().workspace_target_key as string) === wantKey);
    } else {
      d = existingSnap.docs.find((doc) => getRecipientModeFromDoc(doc.data()) === "email");
      if (!d) d = existingSnap.docs[0];
    }

    if (!d) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    const data = d.data();
    const expiresAt = data.expires_at?.toDate?.();
    if (expiresAt && expiresAt < new Date()) {
      return NextResponse.json({ error: "Share expired" }, { status: 404 });
    }

    const version = typeof data.version === "number" ? data.version : 1;
    const wt = data.workspace_target as { kind?: string; id?: string } | undefined;
    return NextResponse.json({
      token: data.token,
      share_url: `/s/${data.token}`,
      access_level: data.access_level ?? "public",
      permission: data.permission ?? "view",
      invited_emails: data.invited_emails ?? [],
      linked_drive_id: data.linked_drive_id,
      backup_file_id: data.backup_file_id ?? null,
      version,
      folder_name: data.folder_name ?? null,
      recipient_mode: getRecipientModeFromDoc(data as Record<string, unknown>),
      workspace_target:
        wt?.kind && wt?.id ? { kind: wt.kind, id: wt.id } : null,
      workspace_target_key: (data.workspace_target_key as string) ?? null,
    });
  }

  const listContext = url.searchParams.get("context");
  const listWorkspaceKindRaw = url.searchParams.get("workspace_kind");
  const listWorkspaceKindParam =
    listWorkspaceKindRaw === "enterprise_workspace" || listWorkspaceKindRaw === "personal_team"
      ? listWorkspaceKindRaw
      : null;
  const listWorkspaceIdParam = url.searchParams.get("workspace_id")?.trim() || null;
  const listOrganizationIdParam =
    url.searchParams.get("organization_id")?.trim() || null;

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
    owner_id?: string;
    sharedByEmail?: string;
    sharedByPhotoUrl?: string;
    invited_emails?: string[];
    recipient_mode?: string;
    workspace_target?: { kind: string; id: string };
    workspace_target_key?: string;
  };

  const owned: ShareItem[] = [];

  for (const d of ownedSnap.docs) {
    const raw = d.data();
    const mode = getRecipientModeFromDoc(raw as Record<string, unknown>);
    if (listContext === "personal" && mode === "workspace") continue;
    if (listContext === "workspace") {
      if (mode !== "workspace") continue;
      const key = raw.workspace_target_key as string | undefined;
      if (listWorkspaceKindParam && listWorkspaceIdParam) {
        const want = workspaceTargetKey(listWorkspaceKindParam, listWorkspaceIdParam);
        if (key !== want) continue;
      } else if (listOrganizationIdParam) {
        const accessible = await getAccessibleWorkspaceIds(uid, listOrganizationIdParam);
        const keys = new Set(
          accessible.map((wid) => workspaceTargetKey("enterprise_workspace", wid))
        );
        if (!key || !keys.has(key)) continue;
      } else continue;
    }

    const hydrated = await hydrateFolderShareDoc(db, d);
    if (!hydrated) continue;
    owned.push({
      id: hydrated.id,
      token: hydrated.token,
      linked_drive_id: hydrated.linked_drive_id,
      folder_name: hydrated.folder_name,
      item_type: hydrated.item_type,
      permission: hydrated.permission,
      created_at: hydrated.created_at,
      share_url: hydrated.share_url,
      invited_emails: hydrated.invited_emails,
      recipient_mode: hydrated.recipient_mode,
      workspace_target: hydrated.workspace_target,
      workspace_target_key: hydrated.workspace_target_key,
    });
  }

  const invited: ShareItem[] = [];
  const emailForQuery = email?.trim().toLowerCase();
  const adminAuth = getAdminAuth();
  const sharerCache = new Map<
    string,
    { sharedBy: string; sharedByEmail: string; sharedByPhotoUrl: string | null }
  >();

  async function pushInvitedWithSharer(d: QueryDocumentSnapshot) {
    const data = d.data();
    if (data.owner_id === uid) return;
    const hydrated = await hydrateFolderShareDoc(db, d);
    if (!hydrated) return;

    const ownerId = (data.owner_id as string)?.trim?.() || "";
    let sharerInfo = ownerId ? sharerCache.get(ownerId) : null;
    if (ownerId && !sharerInfo) {
      const ownerSnap = await db.collection("profiles").doc(ownerId).get();
      const profileData = ownerSnap.exists ? ownerSnap.data() : null;
      let authEmail: string | undefined;
      let sharedByPhotoUrl: string | null = null;
      try {
        const authUser = await adminAuth.getUser(ownerId);
        authEmail = authUser.email ?? undefined;
        sharedByPhotoUrl = authUser.photoURL ?? null;
      } catch {
        /* user missing */
      }
      const sharedByEmail =
        (profileData?.email as string)?.trim() || (authEmail?.trim()) || "";
      const sharedBy =
        (profileData?.displayName as string)?.trim() ||
        sharedByEmail ||
        authEmail ||
        "Unknown";
      sharerInfo = { sharedBy, sharedByEmail, sharedByPhotoUrl };
      sharerCache.set(ownerId, sharerInfo);
    }
    const resolvedSharer = sharerInfo ?? {
      sharedBy: "Unknown",
      sharedByEmail: "",
      sharedByPhotoUrl: null as string | null,
    };

    invited.push({
      id: hydrated.id,
      token: hydrated.token,
      linked_drive_id: hydrated.linked_drive_id,
      folder_name: hydrated.folder_name,
      item_type: hydrated.item_type,
      permission: hydrated.permission,
      created_at: hydrated.created_at,
      share_url: hydrated.share_url,
      sharedBy: resolvedSharer.sharedBy,
      owner_id: ownerId || undefined,
      sharedByEmail: resolvedSharer.sharedByEmail || undefined,
      sharedByPhotoUrl: resolvedSharer.sharedByPhotoUrl ?? undefined,
      recipient_mode: hydrated.recipient_mode,
      workspace_target: hydrated.workspace_target,
      workspace_target_key: hydrated.workspace_target_key,
    });
  }

  if (listContext === null || listContext === "personal") {
    if (emailForQuery) {
      const invitedSnap = await db
        .collection("folder_shares")
        .where("invited_emails", "array-contains", emailForQuery)
        .get();

      for (const d of invitedSnap.docs) {
        if (getRecipientModeFromDoc(d.data() as Record<string, unknown>) === "workspace") {
          continue;
        }
        await pushInvitedWithSharer(d);
      }
    }
  }

  if (listContext === "workspace") {
    const keys: string[] = [];
    if (listWorkspaceKindParam && listWorkspaceIdParam) {
      keys.push(workspaceTargetKey(listWorkspaceKindParam, listWorkspaceIdParam));
    } else if (listOrganizationIdParam) {
      const accessible = await getAccessibleWorkspaceIds(uid, listOrganizationIdParam);
      for (const wid of accessible) {
        keys.push(workspaceTargetKey("enterprise_workspace", wid));
      }
    }
    for (const key of keys) {
      const wsSnap = await db
        .collection("folder_shares")
        .where("workspace_target_key", "==", key)
        .get();
      for (const d of wsSnap.docs) {
        const data = d.data();
        if (data.owner_id === uid) continue;
        const wt = parseWorkspaceTargetKey(key);
        if (wt && !(await userCanAccessWorkspaceShareTarget(uid, wt.kind, wt.id))) continue;
        await pushInvitedWithSharer(d);
      }
    }
  }

  return NextResponse.json({
    owned,
    invited,
  });
  } catch (err) {
    console.error("[GET /api/shares] Error:", err);
    return NextResponse.json(
      { error: "Failed to load shares" },
      { status: 500 }
    );
  }
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
  let email: string | undefined;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
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
    recipient_mode: recipientModeBody,
    workspace_target: workspaceTargetBody,
  } = body;

  const recipientMode: "email" | "workspace" =
    recipientModeBody === "workspace" ? "workspace" : "email";
  const workspaceTargetRaw = workspaceTargetBody as
    | { kind?: string; id?: string }
    | undefined;
  let workspaceKind: WorkspaceShareTargetKind | null = null;
  let workspaceTargetId: string | null = null;
  if (recipientMode === "workspace") {
    if (
      !workspaceTargetRaw ||
      (workspaceTargetRaw.kind !== "enterprise_workspace" &&
        workspaceTargetRaw.kind !== "personal_team") ||
      typeof workspaceTargetRaw.id !== "string" ||
      !workspaceTargetRaw.id.trim()
    ) {
      return NextResponse.json(
        { error: "workspace_target with kind and id is required for workspace shares" },
        { status: 400 }
      );
    }
    workspaceKind = workspaceTargetRaw.kind as WorkspaceShareTargetKind;
    workspaceTargetId = workspaceTargetRaw.id.trim();
    if (!(await userCanAccessWorkspaceShareTarget(uid, workspaceKind, workspaceTargetId))) {
      return NextResponse.json({ error: "You cannot share to this workspace" }, { status: 403 });
    }
  } else if (
    workspaceTargetRaw &&
    typeof workspaceTargetRaw === "object" &&
    workspaceTargetRaw.kind &&
    workspaceTargetRaw.id
  ) {
    return NextResponse.json(
      { error: "Remove workspace_target when using email recipients" },
      { status: 400 }
    );
  }

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

  // folder_name is required for all shares (custom name for standard, required for virtual)
  const folderNameTrimmed = typeof folderName === "string" ? folderName.trim() : "";
  if (!folderNameTrimmed) {
    return NextResponse.json(
      { error: "folder_name is required and cannot be blank" },
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

  const invitedEmailsNormalized = Array.isArray(invitedEmails)
    ? invitedEmails
        .filter((e: unknown) => typeof e === "string")
        .map((e) => (e as string).trim().toLowerCase())
        .filter(Boolean)
    : [];

  if (recipientMode === "workspace" && invitedEmailsNormalized.length > 0) {
    return NextResponse.json(
      { error: "Workspace shares cannot include invited emails" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();

  let targetOrganizationId: string | null = null;
  let workspaceTargetKeyValue: string | null = null;
  if (recipientMode === "workspace" && workspaceKind && workspaceTargetId) {
    workspaceTargetKeyValue = workspaceTargetKey(workspaceKind, workspaceTargetId);
    if (workspaceKind === "enterprise_workspace") {
      const wsSnap = await db.collection("workspaces").doc(workspaceTargetId).get();
      targetOrganizationId = wsSnap.exists
        ? ((wsSnap.data()?.organization_id as string) ?? null)
        : null;
    }
  }

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

    const shareData: Record<string, unknown> = {
      token: shareToken,
      owner_id: uid,
      referenced_file_ids: uniqueIds,
      folder_name: folderName.trim(),
      permission: permission as "view" | "edit",
      access_level: access_level as "private" | "public",
      expires_at: expiresAt && typeof expiresAt === "string" ? new Date(expiresAt) : null,
      created_at: now,
      invited_emails: recipientMode === "workspace" ? [] : invitedEmailsNormalized,
      version: 1,
      recipient_mode: recipientMode,
    };
    if (recipientMode === "workspace" && workspaceKind && workspaceTargetId && workspaceTargetKeyValue) {
      shareData.workspace_target = { kind: workspaceKind, id: workspaceTargetId };
      shareData.workspace_target_key = workspaceTargetKeyValue;
      shareData.target_organization_id = targetOrganizationId;
    }

    await db.collection("folder_shares").doc(shareToken).set(shareData);

    await deliverShareNotificationsAndEmail({
      db,
      uid,
      email,
      recipientMode,
      workspaceKind,
      workspaceTargetId,
      shareToken,
      folderName: shareData.folder_name as string,
      fileIds: uniqueIds,
      invitedEmails: (shareData.invited_emails as string[]) ?? [],
      permission,
    });

    logActivityEvent({
      event_type: "share_link_created",
      actor_user_id: uid,
      scope_type: "personal_account",
      file_id: uniqueIds[0] ?? null,
      target_name: folderNameTrimmed,
      metadata: {
        share_token: shareToken,
        file_count: uniqueIds.length,
        permission: shareData.permission,
        access_level: shareData.access_level,
        is_virtual: true,
      },
    }).catch(() => {});

    return NextResponse.json({
      token: shareToken,
      share_url: `/s/${shareToken}`,
      existing: false,
      access_level: shareData.access_level,
      permission: shareData.permission,
      invited_emails: shareData.invited_emails,
      recipient_mode: recipientMode,
      workspace_target:
        recipientMode === "workspace" && workspaceKind && workspaceTargetId
          ? { kind: workspaceKind, id: workspaceTargetId }
          : null,
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

  // Get-or-create: check for existing share (same recipient mode + workspace key)
  let existingDoc: QueryDocumentSnapshot | null = null;
  if (backupFileIdToStore) {
    const snap = await db
      .collection("folder_shares")
      .where("owner_id", "==", uid)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("backup_file_id", "==", backupFileIdToStore)
      .get();
    const cand =
      recipientMode === "workspace" && workspaceTargetKeyValue
        ? snap.docs.filter((d) => (d.data().workspace_target_key as string) === workspaceTargetKeyValue)
        : snap.docs.filter((d) => getRecipientModeFromDoc(d.data()) === "email");
    if (cand.length > 0) existingDoc = cand[0];
  } else {
    const snap = await db
      .collection("folder_shares")
      .where("owner_id", "==", uid)
      .where("linked_drive_id", "==", linkedDriveId)
      .where("backup_file_id", "==", null)
      .get();
    let folderShares = snap.docs.filter((d) => !d.data().backup_file_id);
    if (recipientMode === "workspace" && workspaceTargetKeyValue) {
      folderShares = folderShares.filter(
        (d) => (d.data().workspace_target_key as string) === workspaceTargetKeyValue
      );
    } else {
      folderShares = folderShares.filter((d) => getRecipientModeFromDoc(d.data()) === "email");
    }
    if (folderShares.length > 0) existingDoc = folderShares[0];
  }

  if (existingDoc) {
    const data = existingDoc.data();
    const existingMode = getRecipientModeFromDoc(data);
    if (existingMode !== recipientMode) {
      return NextResponse.json(
        {
          error:
            "A share already exists for this item with a different recipient type. Delete it first or open that share.",
        },
        { status: 409 }
      );
    }
    if (
      recipientMode === "workspace" &&
      workspaceTargetKeyValue &&
      (data.workspace_target_key as string) !== workspaceTargetKeyValue
    ) {
      return NextResponse.json(
        { error: "A share already exists for this item with a different workspace target." },
        { status: 409 }
      );
    }
    const shareToken = data.token as string;
    return NextResponse.json({
      token: shareToken,
      share_url: `/s/${shareToken}`,
      existing: true,
      recipient_mode: existingMode,
    });
  }

  const shareToken = generateShareToken();
  const now = new Date();

  const shareData: Record<string, unknown> = {
    token: shareToken,
    owner_id: uid,
    linked_drive_id: linkedDriveId,
    backup_file_id: backupFileIdToStore,
    folder_name: folderNameTrimmed,
    permission: permission as "view" | "edit",
    access_level: access_level as "private" | "public",
    expires_at: expiresAt && typeof expiresAt === "string" ? new Date(expiresAt) : null,
    created_at: now,
    invited_emails: recipientMode === "workspace" ? [] : invitedEmailsNormalized,
    version: 1,
    recipient_mode: recipientMode,
  };
  if (recipientMode === "workspace" && workspaceKind && workspaceTargetId && workspaceTargetKeyValue) {
    shareData.workspace_target = { kind: workspaceKind, id: workspaceTargetId };
    shareData.workspace_target_key = workspaceTargetKeyValue;
    shareData.target_organization_id = targetOrganizationId;
  }

  await db.collection("folder_shares").doc(shareToken).set(shareData);

  logActivityEvent({
    event_type: "share_link_created",
    actor_user_id: uid,
    scope_type: "personal_account",
    linked_drive_id: linkedDriveId,
    file_id: backupFileIdToStore,
    target_name: folderNameTrimmed,
    metadata: {
      share_token: shareToken,
      permission: shareData.permission,
      access_level: shareData.access_level,
      is_virtual: false,
    },
  }).catch(() => {});

  const fileIdsStd = backupFileIdToStore ? [backupFileIdToStore] : [];
  await deliverShareNotificationsAndEmail({
    db,
    uid,
    email,
    recipientMode,
    workspaceKind,
    workspaceTargetId,
    shareToken,
    folderName: folderNameTrimmed,
    fileIds: fileIdsStd,
    invitedEmails: (shareData.invited_emails as string[]) ?? [],
    permission,
  });

  return NextResponse.json({
    token: shareToken,
    share_url: `/s/${shareToken}`,
    existing: false,
    recipient_mode: recipientMode,
    workspace_target:
      recipientMode === "workspace" && workspaceKind && workspaceTargetId
        ? { kind: workspaceKind, id: workspaceTargetId }
        : null,
  });
}
