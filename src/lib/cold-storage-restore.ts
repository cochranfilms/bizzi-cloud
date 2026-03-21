/**
 * Restore cold storage files back to hot storage.
 * Called from Stripe webhooks (invoice.paid, checkout.session.completed) when a user
 * pays their subscription and has cold storage to restore.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";

export interface ColdStorageFileDoc {
  id: string;
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
  cold_storage_started_at: { toDate: () => Date };
  cold_storage_expires_at: { toDate: () => Date };
  plan_tier?: string;
  source_type?: string;
  content_type?: string | null;
  modified_at?: string | null;
  created_at?: string;
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
  type: "org" | "consumer";
  orgId?: string;
  userId?: string;
  stripeSubscriptionId?: string;
}): Promise<RestoreResult> {
  const { type, orgId, userId, stripeSubscriptionId } = params;
  const db = getAdminFirestore();

  if (type === "org" && !orgId) {
    throw new Error("orgId required for org restore");
  }
  if (type === "consumer" && !userId) {
    throw new Error("userId required for consumer restore");
  }

  const query =
    type === "org"
      ? db.collection("cold_storage_files").where("org_id", "==", orgId!)
      : db
          .collection("cold_storage_files")
          .where("user_id", "==", userId!)
          .where("org_id", "==", null);

  const snap = await query.get();
  if (snap.empty) {
    return { restored: 0, drivesCreated: 0, seatsCreated: 0 };
  }

  const files = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as ColdStorageFileDoc[];

  if (type === "org") {
    return restoreOrgColdStorage(db, files, orgId!, stripeSubscriptionId);
  }
  return restoreConsumerColdStorage(db, files, userId!);
}

async function restoreOrgColdStorage(
  db: Firestore,
  files: ColdStorageFileDoc[],
  orgId: string,
  stripeSubscriptionId?: string
): Promise<RestoreResult> {
  const now = new Date();

  // Group files by (user_id, drive_name) to create linked_drives
  const driveKey = (uid: string, name: string) => `${uid}::${name}`;
  const driveMap = new Map<string, { userId: string; driveName: string }>();
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

  // Create backup_snapshots and backup_files
  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
    for (const f of chunk) {
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

      const fileRef = db.collection("backup_files").doc();
      batch.set(fileRef, {
        backup_snapshot_id: snapshotRef.id,
        linked_drive_id: newDriveId,
        userId: f.user_id,
        relative_path: f.relative_path,
        object_key: f.object_key,
        size_bytes: f.size_bytes,
        content_type: f.content_type ?? null,
        modified_at: f.modified_at ?? null,
        deleted_at: null,
        organization_id: orgId,
        gallery_id: null,
        created_at: now.toISOString(),
      });

      batch.delete(db.collection("cold_storage_files").doc(f.id));
      restoredCount++;
    }
    await batch.commit();
  }

  // Recreate organization_seats from unique owner+member emails
  const seatEmails = new Set<string>();
  let ownerEmail: string | null = null;
  for (const f of files) {
    const email = (f.owner_email ?? "").trim().toLowerCase();
    if (email) seatEmails.add(email);
    if (!f.member_email && email) ownerEmail = email;
    const memEmail = (f.member_email ?? "").trim().toLowerCase();
    if (memEmail) seatEmails.add(memEmail);
  }
  if (!ownerEmail && seatEmails.size > 0) {
    ownerEmail = Array.from(seatEmails)[0];
  }

  // Find user_id by email from profiles
  const emailToUid = new Map<string, string>();
  const profilesSnap = await db.collection("profiles").get();
  for (const d of profilesSnap.docs) {
    const email = (d.data()?.email as string)?.trim()?.toLowerCase();
    if (email) emailToUid.set(email, d.id);
  }
  // Also from cold storage user_id (files have user_id; owner may match first file's owner)
  for (const f of files) {
    const email = (f.owner_email ?? "").trim().toLowerCase();
    if (email && !emailToUid.has(email)) {
      emailToUid.set(email, f.user_id);
    }
    const mem = (f.member_email ?? "").trim().toLowerCase();
    if (mem) emailToUid.set(mem, f.user_id);
  }

  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const maxSeats = (orgSnap.data()?.max_seats as number) ?? 10;

  let seatsCreated = 0;
  for (const email of seatEmails) {
    const uid = emailToUid.get(email);
    if (!uid) continue;

    const role = email === ownerEmail ? "admin" : "member";
    const seatId = `${orgId}_${uid}_${Date.now()}`;
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

  // Update org: status active, stripe_subscription_id, clear restore invoice url
  const orgUpdate: Record<string, unknown> = {
    status: "active",
    removal_completed_at: FieldValue.delete(),
    removal_requested_at: FieldValue.delete(),
    removal_deadline: FieldValue.delete(),
    removal_requested_by: FieldValue.delete(),
    restore_invoice_url: FieldValue.delete(),
  };
  if (stripeSubscriptionId) {
    orgUpdate.stripe_subscription_id = stripeSubscriptionId;
  }
  await db.collection("organizations").doc(orgId).update(orgUpdate);

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
      const ref = await db.collection("linked_drives").add({
        userId,
        name: f.drive_name,
        permission_handle_id: `restored-${Date.now()}-${userId.slice(0, 8)}`,
        last_synced_at: null,
        created_at: now.toISOString(),
        organization_id: null,
      });
      driveMap.set(f.drive_name, ref.id);
    }
  }

  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
    for (const f of chunk) {
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

      const fileRef = db.collection("backup_files").doc();
      batch.set(fileRef, {
        backup_snapshot_id: snapshotRef.id,
        linked_drive_id: newDriveId,
        userId,
        relative_path: f.relative_path,
        object_key: f.object_key,
        size_bytes: f.size_bytes,
        content_type: f.content_type ?? null,
        modified_at: f.modified_at ?? null,
        deleted_at: null,
        organization_id: null,
        gallery_id: null,
        created_at: now.toISOString(),
      });

      batch.delete(db.collection("cold_storage_files").doc(f.id));
      restoredCount++;
    }
    await batch.commit();
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
  if (params.userId) {
    const snap = await db
      .collection("cold_storage_files")
      .where("user_id", "==", params.userId)
      .where("org_id", "==", null)
      .limit(1)
      .get();
    return !snap.empty;
  }
  return false;
}
