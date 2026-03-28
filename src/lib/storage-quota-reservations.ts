/**
 * Pending upload reservations: bytes held against quota until finalize/commit or release.
 * Server-only. Clients receive reservation_id from presign/multipart init; commit after Firestore row + verify, or release on failure.
 */

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";

export const STORAGE_QUOTA_RESERVATIONS_COLLECTION = "storage_quota_reservations";

/** Default TTL for a pending reservation (finalize or release expected sooner). */
export const RESERVATION_TTL_MS = 24 * 60 * 60 * 1000;

export type ReservationStatus = "pending" | "committed" | "released" | "failed";

export function billingKeyForUser(uid: string): string {
  return `user:${uid}`;
}

export function billingKeyForOrg(orgId: string): string {
  return `org:${orgId}`;
}

function isPendingExpired(data: Record<string, unknown>): boolean {
  const exp = data.expires_at;
  if (exp instanceof Timestamp) return exp.toMillis() <= Date.now();
  return false;
}

/** Sum bytes for pending, non-expired reservations on this billing key. */
export async function sumPendingReservationBytes(billingKey: string): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION)
    .where("billing_key", "==", billingKey)
    .where("status", "==", "pending")
    .get();
  let sum = 0;
  for (const d of snap.docs) {
    const row = d.data();
    if (isPendingExpired(row)) continue;
    sum += typeof row.bytes === "number" ? row.bytes : 0;
  }
  return sum;
}

/** Pending bytes for one uploader on a shared billing key (e.g. org pool). Filters in memory; same query as org-wide sum. */
export async function sumPendingReservationBytesForRequestingUser(
  billingKey: string,
  requestingUserId: string
): Promise<number> {
  const db = getAdminFirestore();
  const snap = await db
    .collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION)
    .where("billing_key", "==", billingKey)
    .where("status", "==", "pending")
    .get();
  let sum = 0;
  for (const d of snap.docs) {
    const row = d.data();
    if (isPendingExpired(row)) continue;
    if ((row.requesting_user_id as string | undefined) !== requestingUserId) continue;
    sum += typeof row.bytes === "number" ? row.bytes : 0;
  }
  return sum;
}

export interface CreatePendingReservationParams {
  billing_key: string;
  /** File-backed used (from snapshot); may be slightly stale outside transaction. */
  file_used_bytes: number;
  new_bytes: number;
  quota_bytes: number | null;
  requesting_user_id: string;
  drive_id: string | null;
  object_key: string | null;
}

/**
 * Atomically verify headroom (file_used + pending reservations + new_bytes <= quota) and create pending doc.
 */
export async function createPendingReservationAtomic(
  params: CreatePendingReservationParams
): Promise<string> {
  const db = getAdminFirestore();
  const {
    billing_key,
    file_used_bytes,
    new_bytes,
    quota_bytes,
    requesting_user_id,
    drive_id,
    object_key,
  } = params;

  if (quota_bytes === null) {
    const ref = db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc();
    await ref.set({
      billing_key,
      bytes: new_bytes,
      status: "pending" as ReservationStatus,
      requesting_user_id,
      drive_id,
      object_key,
      created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + RESERVATION_TTL_MS),
    });
    return ref.id;
  }

  return db.runTransaction(async (tx) => {
    const q = db
      .collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION)
      .where("billing_key", "==", billing_key)
      .where("status", "==", "pending");
    const snap = await tx.get(q);
    let reserved = 0;
    for (const d of snap.docs) {
      const row = d.data();
      if (isPendingExpired(row)) continue;
      reserved += typeof row.bytes === "number" ? row.bytes : 0;
    }
    if (file_used_bytes + reserved + new_bytes > quota_bytes) {
      throw new Error("RESERVATION_QUOTA_RACE");
    }
    const ref = db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc();
    tx.set(ref, {
      billing_key,
      bytes: new_bytes,
      status: "pending" as ReservationStatus,
      requesting_user_id,
      drive_id,
      object_key,
      created_at: FieldValue.serverTimestamp(),
      expires_at: Timestamp.fromMillis(Date.now() + RESERVATION_TTL_MS),
    });
    return ref.id;
  });
}

export async function getReservationDoc(
  reservationId: string
): Promise<{ id: string; data: Record<string, unknown> } | null> {
  const db = getAdminFirestore();
  const ref = db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc(reservationId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, data: snap.data() as Record<string, unknown> };
}

export async function commitReservation(reservationId: string): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc(reservationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const st = snap.data()?.status as string | undefined;
    if (st !== "pending") return;
    tx.update(ref, {
      status: "committed" as ReservationStatus,
      committed_at: FieldValue.serverTimestamp(),
    });
  });
}

export async function releaseReservation(
  reservationId: string,
  reason:
    | "client_abort"
    | "finalize_failed"
    | "size_mismatch"
    | "expired"
    | "admin"
    | "init_failed"
): Promise<void> {
  const db = getAdminFirestore();
  const ref = db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc(reservationId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const st = snap.data()?.status as string | undefined;
    if (st !== "pending") return;
    tx.update(ref, {
      status: "released" as ReservationStatus,
      release_reason: reason,
      released_at: FieldValue.serverTimestamp(),
    });
  });
}

export async function failReservation(reservationId: string, reason: string): Promise<void> {
  const db = getAdminFirestore();
  await db.collection(STORAGE_QUOTA_RESERVATIONS_COLLECTION).doc(reservationId).update({
    status: "failed" as ReservationStatus,
    fail_reason: reason,
    released_at: FieldValue.serverTimestamp(),
  });
}
