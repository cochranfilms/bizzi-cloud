/**
 * Restore cold storage files back to hot storage.
 * Called from Stripe webhooks (invoice.paid, checkout.session.completed) when a user
 * pays their subscription and has cold storage to restore.
 */
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";
import { writeAuditLog } from "@/lib/audit-log";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team";
import type { PersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { isPersonalTeamSeatAccess } from "@/lib/team-seat-pricing";
import { sendOrgRestoredEmail, sendTeamRestoredEmail } from "@/lib/emailjs";
import { macosPackageFirestoreFieldsFromRelativePath } from "@/lib/backup-file-macos-package-metadata";
import { linkBackupFileToMacosPackageContainer } from "@/lib/macos-package-container-admin";

const IN_QUERY_LIMIT = 30;

async function linkMacosPackagesForRestoredFileIds(db: Firestore, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.all(
    ids.map((fid) =>
      linkBackupFileToMacosPackageContainer(db, fid).catch((err) => {
        console.error("[cold-storage-restore] macos package link:", fid, err);
      })
    )
  );
}

async function getExistingBackupObjectKeys(
  db: Firestore,
  params: {
    userId?: string;
    orgId?: string;
    teamOwnerUserId?: string;
    objectKeys: string[];
  }
): Promise<Set<string>> {
  if (params.objectKeys.length === 0) return new Set();
  const uniqueKeys = [...new Set(params.objectKeys)];
  const existing = new Set<string>();

  for (let i = 0; i < uniqueKeys.length; i += IN_QUERY_LIMIT) {
    const chunk = uniqueKeys.slice(i, i + IN_QUERY_LIMIT);
    let q;
    if (params.orgId) {
      q = db
        .collection("backup_files")
        .where("organization_id", "==", params.orgId)
        .where("object_key", "in", chunk);
    } else if (params.teamOwnerUserId) {
      q = db
        .collection("backup_files")
        .where("personal_team_owner_id", "==", params.teamOwnerUserId)
        .where("object_key", "in", chunk);
    } else if (params.userId) {
      q = db
        .collection("backup_files")
        .where("userId", "==", params.userId)
        .where("organization_id", "==", null)
        .where("object_key", "in", chunk);
    } else {
      continue;
    }
    const snap = await q.get();
    for (const d of snap.docs) {
      const key = d.data().object_key as string;
      if (key) existing.add(key);
    }
  }
  return existing;
}

export interface ColdStorageFileDoc {
  id: string;
  personal_team_owner_id?: string | null;
  org_id?: string | null;
  org_name?: string;
  cold_storage_folder?: string;
  owner_email?: string;
  member_email?: string | null;
  object_key: string;
  relative_path: string;
  drive_name: string;
  size_bytes: number;
  user_id: string;
  linked_drive_id?: string;
  workspace_id?: string | null;
  visibility_scope?: string;
  owner_user_id?: string | null;
  team_id?: string | null;
  project_id?: string | null;
  gallery_id?: string | null;
  cold_storage_started_at: { toDate: () => Date };
  cold_storage_expires_at: { toDate: () => Date };
  plan_tier?: string;
  source_type?: string;
  content_type?: string | null;
  modified_at?: string | null;
  created_at?: string;
  is_starred?: boolean;
}

export interface RestoreResult {
  restored: number;
  drivesCreated: number;
  seatsCreated: number;
}

/**
 * Restore organization cold storage to hot storage.
 * Recreates linked_drives, backup_files, organization_seats, and updates org + profiles.
 */
export async function restoreColdStorageToHot(params: {
  type: "org" | "consumer" | "personal_team";
  orgId?: string;
  userId?: string;
  teamOwnerUserId?: string;
  stripeSubscriptionId?: string;
}): Promise<RestoreResult> {
  const { type, orgId, userId, teamOwnerUserId, stripeSubscriptionId } = params;
  const db = getAdminFirestore();

  if (type === "org" && !orgId) {
    throw new Error("orgId required for org restore");
  }
  if (type === "consumer" && !userId) {
    throw new Error("userId required for consumer restore");
  }
  if (type === "personal_team" && !teamOwnerUserId) {
    throw new Error("teamOwnerUserId required for personal_team restore");
  }

  let query;
  if (type === "org") {
    query = db.collection("cold_storage_files").where("org_id", "==", orgId!);
  } else if (type === "personal_team") {
    query = db
      .collection("cold_storage_files")
      .where("personal_team_owner_id", "==", teamOwnerUserId!)
      .where("org_id", "==", null);
  } else {
    query = db
      .collection("cold_storage_files")
      .where("user_id", "==", userId!)
      .where("org_id", "==", null);
  }

  const snap = await query.get();
  if (snap.empty) {
    return { restored: 0, drivesCreated: 0, seatsCreated: 0 };
  }

  const auditUid = type === "consumer" ? userId : type === "personal_team" ? teamOwnerUserId : undefined;
  await writeAuditLog({
    action: "restore_triggered",
    uid: auditUid,
    metadata: { type, orgId, userId, teamOwnerUserId, fileCount: snap.size },
  });

  const files = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as ColdStorageFileDoc[];

  try {
    const result =
      type === "org"
        ? await restoreOrgColdStorage(db, files, orgId!, stripeSubscriptionId)
        : type === "personal_team"
          ? await restorePersonalTeamColdStorage(db, files, teamOwnerUserId!)
          : await restoreConsumerColdStorage(db, files, userId!);
    await writeAuditLog({
      action: "restore_succeeded",
      uid: auditUid,
      metadata: { type, orgId, userId, teamOwnerUserId, ...result },
    });
    return result;
  } catch (err) {
    await writeAuditLog({
      action: "restore_failed",
      uid: auditUid,
      metadata: {
        type,
        orgId,
        userId,
        teamOwnerUserId,
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

async function restoreOrgColdStorage(
  db: Firestore,
  files: ColdStorageFileDoc[],
  orgId: string,
  stripeSubscriptionId?: string
): Promise<RestoreResult> {
  const now = new Date();
  const driveKey = (uid: string, name: string) => `${uid}::${name}`;

  // Use cold_storage_org_snapshots if available, else infer from files
  const snapshotSnap = await db
    .collection("cold_storage_org_snapshots")
    .doc(orgId)
    .get();
  type SnapshotDrive = {
    id?: string;
    name: string;
    userId?: string;
    user_id?: string;
  };
  type SnapshotWorkspace = {
    id: string;
    organization_id?: string;
    drive_id?: string;
    drive_type?: string | null;
    name: string;
    workspace_type: string;
    created_by?: string;
    member_user_ids?: string[];
    team_id?: string | null;
    project_id?: string | null;
    gallery_id?: string | null;
    is_system_workspace?: boolean;
    created_at?: string;
    updated_at?: string;
  };
  const snapshotData = snapshotSnap.data() as
    | {
        drives?: SnapshotDrive[];
        seats?: Array<{ user_id: string; email: string; role: string }>;
        workspaces?: SnapshotWorkspace[];
      }
    | undefined;

  const driveMap = new Map<string, { userId: string; driveName: string }>();
  if (snapshotData?.drives?.length) {
    for (const d of snapshotData.drives) {
      const uid = (d.userId ?? d.user_id ?? "") as string;
      const name = (d.name ?? "Drive") as string;
      if (uid && name) {
        driveMap.set(driveKey(uid, name), { userId: uid, driveName: name });
      }
    }
  }
  for (const f of files) {
    const key = driveKey(f.user_id, f.drive_name);
    if (!driveMap.has(key)) {
      driveMap.set(key, { userId: f.user_id, driveName: f.drive_name });
    }
  }

  // Create linked_drives
  const driveIdByKey = new Map<string, string>();
  for (const [key, { userId: uid, driveName }] of driveMap) {
    const ref = await db.collection("linked_drives").add({
      userId: uid,
      name: driveName,
      permission_handle_id: `restored-${Date.now()}-${uid.slice(0, 8)}`,
      last_synced_at: null,
      created_at: now.toISOString(),
      organization_id: orgId,
    });
    driveIdByKey.set(key, ref.id);
  }

  // Build old drive id -> new drive id for workspace mapping
  const oldDriveIdToNew = new Map<string, string>();
  if (snapshotData?.drives?.length) {
    for (const d of snapshotData.drives) {
      const uid = (d.userId ?? d.user_id ?? "") as string;
      const name = (d.name ?? "Drive") as string;
      if (d.id && uid && name) {
        const newId = driveIdByKey.get(driveKey(uid, name));
        if (newId) oldDriveIdToNew.set(d.id, newId);
      }
    }
  }
  for (const f of files) {
    if (f.linked_drive_id) {
      const dkey = driveKey(f.user_id, f.drive_name);
      const newId = driveIdByKey.get(dkey);
      if (newId) oldDriveIdToNew.set(f.linked_drive_id, newId);
    }
  }

  // Recreate workspaces from snapshot before creating backup_files
  const oldWorkspaceIdToNew = new Map<string, string>();
  const nowIso = now.toISOString();
  if (snapshotData?.workspaces?.length) {
    for (const ws of snapshotData.workspaces) {
      const newDriveId = ws.drive_id ? oldDriveIdToNew.get(ws.drive_id) : undefined;
      if (!newDriveId && ws.drive_id) continue; // Skip if drive mapping missing
      const ref = await db.collection("workspaces").add({
        organization_id: orgId,
        drive_id: newDriveId ?? null,
        drive_type: ws.drive_type ?? null,
        name: ws.name ?? "Workspace",
        workspace_type: ws.workspace_type ?? "private",
        created_by: ws.created_by ?? null,
        member_user_ids: ws.member_user_ids ?? [],
        team_id: ws.team_id ?? null,
        project_id: ws.project_id ?? null,
        gallery_id: ws.gallery_id ?? null,
        is_system_workspace: ws.is_system_workspace ?? false,
        created_at: ws.created_at ?? nowIso,
        updated_at: ws.updated_at ?? nowIso,
      });
      if (ws.id) oldWorkspaceIdToNew.set(ws.id, ref.id);
    }
  }

  // Idempotency: skip creating backup_files that already exist
  const orgObjectKeys = files.map((f) => f.object_key).filter(Boolean);
  const existingBackupKeys = await getExistingBackupObjectKeys(db, {
    orgId,
    objectKeys: orgObjectKeys,
  });

  // Create backup_snapshots and backup_files
  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
    const restoredMacosFileIds: string[] = [];
    for (const f of chunk) {
      if (existingBackupKeys.has(f.object_key)) {
        batch.delete(db.collection("cold_storage_files").doc(f.id));
        restoredCount++;
        continue;
      }

      const dkey = driveKey(f.user_id, f.drive_name);
      const newDriveId = driveIdByKey.get(dkey);
      if (!newDriveId) continue;

      const snapshotRef = db.collection("backup_snapshots").doc();
      batch.set(snapshotRef, {
        linked_drive_id: newDriveId,
        status: "completed",
        files_count: 1,
        bytes_synced: f.size_bytes,
        error_message: null,
        started_at: now.toISOString(),
        completed_at: now.toISOString(),
      });

      const restoredWorkspaceId = f.workspace_id
        ? oldWorkspaceIdToNew.get(f.workspace_id) ?? null
        : null;

      const relPath = String(f.relative_path ?? "");
      const fileRef = db.collection("backup_files").doc();
      restoredMacosFileIds.push(fileRef.id);
      batch.set(fileRef, {
        backup_snapshot_id: snapshotRef.id,
        linked_drive_id: newDriveId,
        userId: f.user_id,
        relative_path: relPath,
        object_key: f.object_key,
        size_bytes: f.size_bytes,
        content_type: f.content_type ?? null,
        modified_at: f.modified_at ?? null,
        deleted_at: null,
        organization_id: orgId,
        workspace_id: restoredWorkspaceId,
        visibility_scope: f.visibility_scope ?? "private_org",
        owner_user_id: f.owner_user_id ?? f.user_id ?? null,
        team_id: f.team_id ?? null,
        project_id: f.project_id ?? null,
        gallery_id: f.gallery_id ?? null,
        created_at: now.toISOString(),
        ...macosPackageFirestoreFieldsFromRelativePath(relPath),
      });

      batch.delete(db.collection("cold_storage_files").doc(f.id));
      restoredCount++;
    }
    await batch.commit();
    await linkMacosPackagesForRestoredFileIds(db, restoredMacosFileIds);
  }

  // Recreate organization_seats: prefer snapshot, else infer from files
  const emailToUid = new Map<string, string>();
  const profilesSnap = await db.collection("profiles").get();
  for (const d of profilesSnap.docs) {
    const email = (d.data()?.email as string)?.trim()?.toLowerCase();
    if (email) emailToUid.set(email, d.id);
  }
  for (const f of files) {
    const email = (f.owner_email ?? "").trim().toLowerCase();
    if (email && !emailToUid.has(email)) emailToUid.set(email, f.user_id);
    const mem = (f.member_email ?? "").trim().toLowerCase();
    if (mem) emailToUid.set(mem, f.user_id);
  }

  type SeatInput = { uid: string; email: string; role: string };
  let seatsToCreate: SeatInput[] = [];
  if (snapshotData?.seats?.length) {
    for (const s of snapshotData.seats) {
      const uid = (s.user_id ?? "").trim();
      const email = (s.email ?? "").trim().toLowerCase();
      const role = (s.role ?? "member") as string;
      if (uid && email) {
        seatsToCreate.push({ uid, email, role });
      }
    }
  }
  if (seatsToCreate.length === 0) {
    const seatEmails = new Set<string>();
    let ownerEmail: string | null = null;
    for (const f of files) {
      const email = (f.owner_email ?? "").trim().toLowerCase();
      if (email) seatEmails.add(email);
      if (!f.member_email && email) ownerEmail = email;
      const mem = (f.member_email ?? "").trim().toLowerCase();
      if (mem) seatEmails.add(mem);
    }
    if (!ownerEmail && seatEmails.size > 0) ownerEmail = Array.from(seatEmails)[0];
    for (const email of seatEmails) {
      const uid = emailToUid.get(email);
      if (!uid) continue;
      seatsToCreate.push({
        uid,
        email,
        role: email === ownerEmail ? "admin" : "member",
      });
    }
  }

  let seatsCreated = 0;
  for (let i = 0; i < seatsToCreate.length; i++) {
    const { uid, email, role } = seatsToCreate[i];
    const seatId = `${orgId}_${uid}_${Date.now()}_${i}`;
    await db.collection("organization_seats").doc(seatId).set({
      organization_id: orgId,
      user_id: uid,
      role,
      email,
      display_name: null,
      invited_at: now.toISOString(),
      accepted_at: now.toISOString(),
      status: "active",
      storage_quota_bytes: DEFAULT_SEAT_STORAGE_BYTES,
    });
    seatsCreated++;

    await db.collection("profiles").doc(uid).update({
      organization_id: orgId,
      organization_role: role,
    });
  }

  // Update org: status active, stripe_subscription_id, clear restore/billing urls
  const orgUpdate: Record<string, unknown> = {
    status: "active",
    removal_completed_at: FieldValue.delete(),
    removal_requested_at: FieldValue.delete(),
    removal_deadline: FieldValue.delete(),
    removal_requested_by: FieldValue.delete(),
    restore_invoice_url: FieldValue.delete(),
    billing_status: "active",
    unpaid_invoice_url: FieldValue.delete(),
  };
  if (stripeSubscriptionId) {
    orgUpdate.stripe_subscription_id = stripeSubscriptionId;
  }
  await db.collection("organizations").doc(orgId).update(orgUpdate);

  const orgNameRestored =
    (files[0]?.org_name as string | undefined) ??
    ((await db.collection("organizations").doc(orgId).get()).data()?.name as string | undefined);
  const ownerEmailRestore = (files[0]?.owner_email ?? "").trim().toLowerCase();
  if (ownerEmailRestore) {
    sendOrgRestoredEmail({
      to_email: ownerEmailRestore,
      org_name: orgNameRestored ?? "Organization",
    }).catch((err) => console.error("[restoreOrgColdStorage] restored email failed", orgId, err));
  }

  return {
    restored: restoredCount,
    drivesCreated: driveMap.size,
    seatsCreated,
  };
}

async function restorePersonalTeamColdStorage(
  db: Firestore,
  files: ColdStorageFileDoc[],
  teamOwnerUserId: string
): Promise<RestoreResult> {
  const now = new Date();
  const driveMap = new Map<string, string>();
  for (const f of files) {
    if (!driveMap.has(f.drive_name)) {
      const isRaw = f.drive_name === "RAW";
      const ref = await db.collection("linked_drives").add({
        userId: teamOwnerUserId,
        name: f.drive_name,
        permission_handle_id: `restored-${Date.now()}-${teamOwnerUserId.slice(0, 8)}`,
        last_synced_at: null,
        createdAt: now,
        organization_id: null,
        personal_team_owner_id: teamOwnerUserId,
        ...(isRaw ? { creator_section: true, is_creator_raw: true } : {}),
      });
      driveMap.set(f.drive_name, ref.id);
    }
  }

  const objectKeys = files.map((f) => f.object_key).filter(Boolean);
  const existingBackupKeys = await getExistingBackupObjectKeys(db, {
    teamOwnerUserId,
    objectKeys,
  });

  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
    const restoredMacosFileIds: string[] = [];
    for (const f of chunk) {
      if (existingBackupKeys.has(f.object_key)) {
        batch.delete(db.collection("cold_storage_files").doc(f.id));
        restoredCount++;
        continue;
      }
      const newDriveId = driveMap.get(f.drive_name);
      if (!newDriveId) continue;
      const uploaderId = f.user_id;
      const snapshotRef = db.collection("backup_snapshots").doc();
      batch.set(snapshotRef, {
        linked_drive_id: newDriveId,
        status: "completed",
        files_count: 1,
        bytes_synced: f.size_bytes,
        error_message: null,
        started_at: now.toISOString(),
        completed_at: now.toISOString(),
      });
      const relPath = String(f.relative_path ?? "");
      const fileRef = db.collection("backup_files").doc();
      restoredMacosFileIds.push(fileRef.id);
      batch.set(fileRef, {
        backup_snapshot_id: snapshotRef.id,
        linked_drive_id: newDriveId,
        userId: uploaderId,
        relative_path: relPath,
        object_key: f.object_key,
        size_bytes: f.size_bytes,
        content_type: f.content_type ?? null,
        modified_at: f.modified_at ?? null,
        deleted_at: null,
        organization_id: null,
        workspace_id: null,
        visibility_scope: "personal_team",
        owner_user_id: f.owner_user_id ?? uploaderId ?? null,
        personal_team_owner_id: teamOwnerUserId,
        team_id: null,
        project_id: null,
        gallery_id: f.gallery_id ?? null,
        created_at: now.toISOString(),
        is_starred: f.is_starred ?? false,
        ...macosPackageFirestoreFieldsFromRelativePath(relPath),
      });
      batch.delete(db.collection("cold_storage_files").doc(f.id));
      restoredCount++;
    }
    await batch.commit();
    await linkMacosPackagesForRestoredFileIds(db, restoredMacosFileIds);
  }

  const snapshotSnap = await db
    .collection("cold_storage_team_snapshots")
    .doc(teamOwnerUserId)
    .get();
  let seatsCreated = 0;
  const snapshotData = snapshotSnap.data();
  if (snapshotData?.seats?.length) {
    for (const s of snapshotData.seats as Array<{
      member_user_id?: string;
      seat_access_level?: string;
      invited_email?: string | null;
    }>) {
      const mid = (s.member_user_id ?? "").trim();
      const levelRaw = (s.seat_access_level ?? "gallery") as string;
      if (!mid) continue;
      const level = isPersonalTeamSeatAccess(levelRaw)
        ? (levelRaw as PersonalTeamSeatAccess)
        : "gallery";
      const docId = personalTeamSeatDocId(teamOwnerUserId, mid);
      await db.collection(PERSONAL_TEAM_SEATS_COLLECTION).doc(docId).set({
        team_owner_user_id: teamOwnerUserId,
        member_user_id: mid,
        seat_access_level: level,
        status: "active",
        invited_email: s.invited_email ?? null,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      await db.collection("profiles").doc(mid).set(
        {
          personal_team_owner_id: teamOwnerUserId,
          personal_team_seat_access: level,
        },
        { merge: true }
      );
      seatsCreated++;
    }
  }

  await db.collection("profiles").doc(teamOwnerUserId).set(
    {
      team_storage_lifecycle_status: FieldValue.delete(),
      team_cold_storage_started_at: FieldValue.delete(),
      team_cold_storage_expires_at: FieldValue.delete(),
      team_restore_status: FieldValue.delete(),
      team_restore_invoice_url: FieldValue.delete(),
    },
    { merge: true }
  );

  try {
    const r = await getAdminAuth().getUser(teamOwnerUserId);
    const em = (r.email ?? "").trim().toLowerCase();
    if (em) {
      sendTeamRestoredEmail({ to_email: em }).catch((err) =>
        console.error("[restorePersonalTeamColdStorage] restored email failed", teamOwnerUserId, err)
      );
    }
  } catch {
    /* ignore */
  }

  return {
    restored: restoredCount,
    drivesCreated: driveMap.size,
    seatsCreated,
  };
}

async function restoreConsumerColdStorage(
  db: Firestore,
  files: ColdStorageFileDoc[],
  userId: string
): Promise<RestoreResult> {
  const now = new Date();

  const driveKey = (name: string) => name;
  const driveMap = new Map<string, string>();
  for (const f of files) {
    if (!driveMap.has(f.drive_name)) {
      const isRaw = f.drive_name === "RAW";
      const ref = await db.collection("linked_drives").add({
        userId,
        name: f.drive_name,
        permission_handle_id: `restored-${Date.now()}-${userId.slice(0, 8)}`,
        last_synced_at: null,
        createdAt: now,
        organization_id: null,
        ...(isRaw ? { creator_section: true, is_creator_raw: true } : {}),
      });
      driveMap.set(f.drive_name, ref.id);
    }
  }

  // Idempotency: skip creating backup_files that already exist
  const consumerObjectKeys = files.map((f) => f.object_key).filter(Boolean);
  const existingBackupKeys = await getExistingBackupObjectKeys(db, {
    userId,
    objectKeys: consumerObjectKeys,
  });

  const objectKeyToBackupFileId = new Map<string, string>();
  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
    const restoredMacosFileIds: string[] = [];
    for (const f of chunk) {
      if (existingBackupKeys.has(f.object_key)) {
        batch.delete(db.collection("cold_storage_files").doc(f.id));
        restoredCount++;
        continue;
      }

      const newDriveId = driveMap.get(f.drive_name);
      if (!newDriveId) continue;

      const snapshotRef = db.collection("backup_snapshots").doc();
      batch.set(snapshotRef, {
        linked_drive_id: newDriveId,
        status: "completed",
        files_count: 1,
        bytes_synced: f.size_bytes,
        error_message: null,
        started_at: now.toISOString(),
        completed_at: now.toISOString(),
      });

      const relPath = String(f.relative_path ?? "");
      const fileRef = db.collection("backup_files").doc();
      restoredMacosFileIds.push(fileRef.id);
      batch.set(fileRef, {
        backup_snapshot_id: snapshotRef.id,
        linked_drive_id: newDriveId,
        userId,
        relative_path: relPath,
        object_key: f.object_key,
        size_bytes: f.size_bytes,
        content_type: f.content_type ?? null,
        modified_at: f.modified_at ?? null,
        deleted_at: null,
        organization_id: null,
        workspace_id: null,
        visibility_scope: "personal",
        owner_user_id: userId,
        team_id: null,
        project_id: null,
        gallery_id: null,
        created_at: now.toISOString(),
        is_starred: f.is_starred ?? false,
        ...macosPackageFirestoreFieldsFromRelativePath(relPath),
      });

      objectKeyToBackupFileId.set(f.object_key, fileRef.id);
      batch.delete(db.collection("cold_storage_files").doc(f.id));
      restoredCount++;
    }
    await batch.commit();
    await linkMacosPackagesForRestoredFileIds(db, restoredMacosFileIds);
  }

  // If restored from account_delete: build full object_key map (include existing), restore galleries/hearts/pinned
  const fromAccountDelete = files.some(
    (f) => (f as { source_type?: string }).source_type === "account_delete"
  );
  if (fromAccountDelete) {
    // Fill in object_key -> backup_file_id for files that already existed (idempotency skip)
    const allObjectKeys = files.map((f) => f.object_key).filter(Boolean);
    for (let k = 0; k < allObjectKeys.length; k += IN_QUERY_LIMIT) {
      const chunk = allObjectKeys.slice(k, k + IN_QUERY_LIMIT);
      const existingSnap = await db
        .collection("backup_files")
        .where("userId", "==", userId)
        .where("organization_id", "==", null)
        .where("object_key", "in", chunk)
        .get();
      for (const d of existingSnap.docs) {
        const key = d.data().object_key as string;
        if (key && !objectKeyToBackupFileId.has(key)) {
          objectKeyToBackupFileId.set(key, d.id);
        }
      }
    }

    const { restoreConsumerGalleries } = await import("@/lib/cold-storage-gallery-snapshot");
    await restoreConsumerGalleries(db, userId, objectKeyToBackupFileId, driveMap);

    await db.collection("profiles").doc(userId).update({
      account_deletion_requested_at: FieldValue.delete(),
      account_deletion_effective_at: FieldValue.delete(),
    });
    await db.collection("cold_storage_restore_requirements").doc(userId).delete();
  }

  return {
    restored: restoredCount,
    drivesCreated: driveMap.size,
    seatsCreated: 0,
  };
}

/**
 * Check if an org or user has cold storage. Used by webhooks before restore.
 */
export async function hasColdStorage(params: {
  orgId?: string;
  userId?: string;
  /** Personal team container cold rows use personal_team_owner_id */
  teamOwnerUserId?: string;
}): Promise<boolean> {
  const db = getAdminFirestore();
  if (params.orgId) {
    const snap = await db
      .collection("cold_storage_files")
      .where("org_id", "==", params.orgId)
      .limit(1)
      .get();
    return !snap.empty;
  }
  if (params.teamOwnerUserId) {
    const snap = await db
      .collection("cold_storage_files")
      .where("personal_team_owner_id", "==", params.teamOwnerUserId)
      .limit(1)
      .get();
    return !snap.empty;
  }
  if (params.userId) {
    const snap = await db
      .collection("cold_storage_files")
      .where("user_id", "==", params.userId)
      .where("org_id", "==", null)
      .limit(25)
      .get();
    return snap.docs.some((d) => !d.data().personal_team_owner_id);
  }
  return false;
}
