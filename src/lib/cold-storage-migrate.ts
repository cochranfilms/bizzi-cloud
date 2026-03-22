/**
 * Migrate files from hot storage (backup_files) to cold storage (cold_storage_files).
 * Used by: subscription.deleted (consumer), invoice.payment_failed, subscription.updated (past_due),
 * and account delete flow.
 *
 * Does NOT delete B2 objects—those stay until cold-storage-cleanup cron after retention expires.
 */
import { getAdminFirestore, getAdminAuth } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import {
  getRetentionDays,
  type ColdStorageSourceType,
} from "@/lib/cold-storage-retention";

const BATCH_SIZE = 100;
const IN_QUERY_LIMIT = 30;

async function getExistingColdStorageObjectKeys(
  db: Firestore,
  ownerType: "consumer" | "organization",
  params: { userId?: string; orgId?: string; objectKeys: string[] }
): Promise<Set<string>> {
  if (params.objectKeys.length === 0) return new Set();
  const uniqueKeys = [...new Set(params.objectKeys)];
  const existing = new Set<string>();

  for (let i = 0; i < uniqueKeys.length; i += IN_QUERY_LIMIT) {
    const chunk = uniqueKeys.slice(i, i + IN_QUERY_LIMIT);
    let q;
    if (ownerType === "consumer" && params.userId) {
      q = db
        .collection("cold_storage_files")
        .where("user_id", "==", params.userId)
        .where("org_id", "==", null)
        .where("object_key", "in", chunk);
    } else if (ownerType === "organization" && params.orgId) {
      q = db
        .collection("cold_storage_files")
        .where("org_id", "==", params.orgId)
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

export interface MigrateConsumerResult {
  migrated: number;
  coldStorageFolder: string;
}

export interface MigrateOrgResult {
  migrated: number;
}

export interface MigrateAccountDeleteResult {
  migrated: number;
  coldStorageFolder: string;
}

/**
 * Migrate consumer (personal) backup files to cold storage.
 * Query: backup_files where userId == X and organization_id == null.
 */
export async function migrateConsumerToColdStorage(
  userId: string,
  sourceType: ColdStorageSourceType,
  planTier?: string
): Promise<MigrateConsumerResult> {
  const db = getAdminFirestore();
  const auth = getAdminAuth();

  let userEmail = "";
  try {
    const userRecord = await auth.getUser(userId);
    userEmail = (userRecord.email ?? "").trim().toLowerCase();
  } catch {
    // Use userId as fallback for folder name
  }
  const coldStorageFolder = userEmail || `user_${userId}`;
  const retentionDays = getRetentionDays(planTier ?? "solo", sourceType);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  const now = Timestamp.now();

  const drivesSnap = await db
    .collection("linked_drives")
    .where("userId", "==", userId)
    .where("organization_id", "==", null)
    .get();
  const driveIdToName = new Map<string, string>();
  for (const d of drivesSnap.docs) {
    driveIdToName.set(d.id, (d.data().name as string) ?? "Drive");
  }

  let migratedCount = 0;
  let filesRemaining = true;

  while (filesRemaining) {
    const filesSnap = await db
      .collection("backup_files")
      .where("userId", "==", userId)
      .where("organization_id", "==", null)
      .limit(BATCH_SIZE)
      .get();

    if (filesSnap.empty) {
      filesRemaining = false;
      break;
    }

    const objectKeys = filesSnap.docs
      .map((d) => (d.data().object_key as string) ?? "")
      .filter(Boolean);
    const existingColdKeys = await getExistingColdStorageObjectKeys(
      db,
      "consumer",
      { userId, objectKeys }
    );

    const batch = db.batch();
    for (const fileDoc of filesSnap.docs) {
      const data = fileDoc.data();
      const objectKey = (data.object_key as string) ?? "";
      if (!objectKey) {
        batch.delete(fileDoc.ref);
        continue;
      }
      if (existingColdKeys.has(objectKey)) {
        batch.delete(fileDoc.ref);
        migratedCount++;
        continue;
      }

      const driveId = data.linked_drive_id as string;
      const driveName = driveIdToName.get(driveId) ?? "Drive";

      const planTierVal = planTier ?? "solo";
      const retentionSnapshot = {
        plan_tier: planTierVal,
        retention_days: retentionDays,
        computed_at: now,
      };
      const coldRef = db.collection("cold_storage_files").doc();
      batch.set(coldRef, {
        owner_type: "consumer",
        user_id: userId,
        org_id: null,
        storage_scope_type: "personal_account",
        workspace_id: null,
        visibility_scope: "personal",
        owner_user_id: userId,
        team_id: null,
        project_id: null,
        gallery_id: null,
        cold_storage_folder: coldStorageFolder,
        object_key: objectKey,
        relative_path: (data.relative_path as string) ?? "",
        drive_name: driveName,
        size_bytes: typeof data.size_bytes === "number" ? data.size_bytes : 0,
        linked_drive_id: driveId,
        cold_storage_started_at: now,
        cold_storage_expires_at: Timestamp.fromDate(expiresAt),
        retention_days: retentionDays,
        retention_snapshot: retentionSnapshot,
        entered_cold_storage_at: now,
        cold_storage_status: "active",
        plan_tier: planTierVal,
        source_type: sourceType,
        content_type: data.content_type ?? null,
        modified_at: data.modified_at ?? null,
        created_at: data.created_at ?? new Date().toISOString(),
        is_starred: data.is_starred ?? false,
      });
      batch.delete(fileDoc.ref);
      migratedCount++;
    }
    await batch.commit();
  }

  // Delete backup_snapshots and linked_drives for consumer
  const driveIds = drivesSnap.docs.map((d) => d.id);
  for (const driveId of driveIds) {
    const snapSnap = await db
      .collection("backup_snapshots")
      .where("linked_drive_id", "==", driveId)
      .get();
    for (const s of snapSnap.docs) {
      await s.ref.delete();
    }
  }
  for (const d of drivesSnap.docs) {
    await d.ref.delete();
  }

  return { migrated: migratedCount, coldStorageFolder };
}

/**
 * Migrate organization backup files to cold storage.
 * Used by: org-removal-cleanup (already inline), or by Stripe webhooks when org subscription fails.
 */
export async function migrateOrgToColdStorage(
  orgId: string,
  sourceType: ColdStorageSourceType
): Promise<MigrateOrgResult> {
  const db = getAdminFirestore();

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();
  const orgName = (orgData?.name as string) ?? "Organization";

  const seatsSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .get();
  const ownerSeat = seatsSnap.docs.find((d) => d.data().role === "admin");
  const ownerEmail = (ownerSeat?.data()?.email as string)?.trim()?.toLowerCase() ?? "";
  const userIdToEmail = new Map<string, string>();
  const userIdToRole = new Map<string, string>();
  for (const d of seatsSnap.docs) {
    const data = d.data();
    const uid = (data.user_id as string)?.trim();
    const email = (data.email as string)?.trim()?.toLowerCase();
    const role = (data.role as string) ?? "member";
    if (uid && email) {
      userIdToEmail.set(uid, email);
      userIdToRole.set(uid, role);
    }
  }

  const drivesSnap = await db
    .collection("linked_drives")
    .where("organization_id", "==", orgId)
    .get();
  const driveIdToName = new Map<string, string>();
  for (const d of drivesSnap.docs) {
    driveIdToName.set(d.id, (d.data().name as string) ?? "Drive");
  }

  const retentionDays = getRetentionDays("enterprise", sourceType);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + retentionDays);
  const now = Timestamp.now();

  let migratedCount = 0;
  let filesRemaining = true;

  while (filesRemaining) {
    const filesSnap = await db
      .collection("backup_files")
      .where("organization_id", "==", orgId)
      .limit(BATCH_SIZE)
      .get();

    if (filesSnap.empty) {
      filesRemaining = false;
      break;
    }

    const orgObjectKeys = filesSnap.docs
      .map((d) => (d.data().object_key as string) ?? "")
      .filter(Boolean);
    const existingOrgColdKeys = await getExistingColdStorageObjectKeys(
      db,
      "organization",
      { orgId, objectKeys: orgObjectKeys }
    );

    const batch = db.batch();
    for (const fileDoc of filesSnap.docs) {
      const data = fileDoc.data();
      const objectKey = (data.object_key as string) ?? "";
      if (!objectKey) {
        batch.delete(fileDoc.ref);
        continue;
      }
      if (existingOrgColdKeys.has(objectKey)) {
        batch.delete(fileDoc.ref);
        migratedCount++;
        continue;
      }

      const fileUserId = (data.userId ?? data.user_id) as string;
      const email = userIdToEmail.get(fileUserId) ?? "";
      const role = userIdToRole.get(fileUserId) ?? "member";
      const driveId = data.linked_drive_id as string;
      const driveName = driveIdToName.get(driveId) ?? "Drive";

      const isOwner = role === "admin" || email === ownerEmail;
      const coldStorageFolder = isOwner
        ? ownerEmail || email
        : `${ownerEmail}/${email}`.replace(/\/+$/, "");

      const orgRetentionSnapshot = {
        plan_tier: "enterprise",
        retention_days: retentionDays,
        computed_at: now,
      };
      const coldRef = db.collection("cold_storage_files").doc();
      batch.set(coldRef, {
        owner_type: "organization",
        org_id: orgId,
        org_name: orgName,
        storage_scope_type: "organization",
        workspace_id: data.workspace_id ?? null,
        visibility_scope: data.visibility_scope ?? "private_org",
        owner_user_id: data.owner_user_id ?? fileUserId ?? null,
        team_id: data.team_id ?? null,
        project_id: data.project_id ?? null,
        gallery_id: data.gallery_id ?? null,
        cold_storage_folder: coldStorageFolder || email,
        owner_email: ownerEmail || email,
        member_email: isOwner ? null : email,
        object_key: objectKey,
        relative_path: (data.relative_path as string) ?? "",
        drive_name: driveName,
        size_bytes: typeof data.size_bytes === "number" ? data.size_bytes : 0,
        user_id: fileUserId,
        linked_drive_id: driveId,
        cold_storage_started_at: now,
        cold_storage_expires_at: Timestamp.fromDate(expiresAt),
        retention_days: retentionDays,
        retention_snapshot: orgRetentionSnapshot,
        entered_cold_storage_at: now,
        cold_storage_status: "active",
        plan_tier: "enterprise",
        source_type: sourceType,
        content_type: data.content_type ?? null,
        modified_at: data.modified_at ?? null,
        created_at: data.created_at ?? new Date().toISOString(),
      });
      batch.delete(fileDoc.ref);
      migratedCount++;
    }
    await batch.commit();
  }

  // Delete backup_snapshots for org drives
  const driveIds = drivesSnap.docs.map((d) => d.id);
  for (const driveId of driveIds) {
    const snapSnap = await db
      .collection("backup_snapshots")
      .where("linked_drive_id", "==", driveId)
      .get();
    for (const s of snapSnap.docs) {
      await s.ref.delete();
    }
  }

  // Delete linked_drives
  for (const d of drivesSnap.docs) {
    await d.ref.delete();
  }

  return { migrated: migratedCount };
}

/**
 * Migrate consumer files to cold storage when user deletes account.
 * 30-day retention. Does NOT delete profile or Firebase Auth.
 */
export async function migrateAccountDeleteToColdStorage(
  userId: string
): Promise<MigrateAccountDeleteResult> {
  return migrateConsumerToColdStorage(userId, "account_delete", "solo");
}
