/**
 * Restore cold storage files back to hot storage.
 * Called from Stripe webhooks (invoice.paid, checkout.session.completed) when a user
 * pays their subscription and has cold storage to restore.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import { DEFAULT_SEAT_STORAGE_BYTES } from "@/lib/enterprise-storage";
import { writeAuditLog } from "@/lib/audit-log";

const IN_QUERY_LIMIT = 30;

async function getExistingBackupObjectKeys(
  db: Firestore,
  params: { userId?: string; orgId?: string; objectKeys: string[] }
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

  await writeAuditLog({
    action: "restore_triggered",
    uid: type === "consumer" ? userId : undefined,
    metadata: { type, orgId, userId, fileCount: snap.size },
  });

  const files = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as ColdStorageFileDoc[];

  try {
    const result =
      type === "org"
        ? await restoreOrgColdStorage(db, files, orgId!, stripeSubscriptionId)
        : await restoreConsumerColdStorage(db, files, userId!);
    await writeAuditLog({
      action: "restore_succeeded",
      uid: type === "consumer" ? userId : undefined,
      metadata: { type, orgId, userId, ...result },
    });
    return result;
  } catch (err) {
    await writeAuditLog({
      action: "restore_failed",
      uid: type === "consumer" ? userId : undefined,
      metadata: {
        type,
        orgId,
        userId,
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
  const snapshotData = snapshotSnap.data() as
    | { drives?: Array<{ name: string; userId?: string; user_id?: string }>; seats?: Array<{ user_id: string; email: string; role: string }> }
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

  // Idempotency: skip creating backup_files that already exist
  const consumerObjectKeys = files.map((f) => f.object_key).filter(Boolean);
  const existingBackupKeys = await getExistingBackupObjectKeys(db, {
    userId,
    objectKeys: consumerObjectKeys,
  });

  const batchSize = 400;
  let restoredCount = 0;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = db.batch();
    const chunk = files.slice(i, i + batchSize);
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

  // If restored from account_delete, clear deletion flags on profile and restore requirements
  const fromAccountDelete = files.some(
    (f) => (f as { source_type?: string }).source_type === "account_delete"
  );
  if (fromAccountDelete) {
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
