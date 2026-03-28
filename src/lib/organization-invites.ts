/**
 * Pending org membership lives in organization_invites only (not organization_seats).
 * Legacy pending rows may still exist in organization_seats for older deploys — read both until migrated.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { hashInviteToken } from "@/lib/invite-token";

export const ORGANIZATION_INVITES_COLLECTION = "organization_invites";

export async function findPendingOrgInviteByToken(
  db: Firestore,
  token: string
): Promise<QueryDocumentSnapshot | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const tokenHash = hashInviteToken(trimmed);
  const newSnap = await db
    .collection(ORGANIZATION_INVITES_COLLECTION)
    .where("invite_token_hash", "==", tokenHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!newSnap.empty) return newSnap.docs[0];

  const legacyHashSnap = await db
    .collection("organization_seats")
    .where("invite_token_hash", "==", tokenHash)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!legacyHashSnap.empty) return legacyHashSnap.docs[0];

  const legacyPlainSnap = await db
    .collection("organization_seats")
    .where("invite_token", "==", trimmed)
    .where("status", "==", "pending")
    .limit(1)
    .get();
  if (!legacyPlainSnap.empty) return legacyPlainSnap.docs[0];

  return null;
}

export async function countActiveSeatsForOrg(db: Firestore, orgId: string): Promise<number> {
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("status", "==", "active")
    .get();
  return snap.size;
}

/** Pending rows in organization_invites plus legacy pending organization_seats. */
export async function countPendingInvitesForOrg(db: Firestore, orgId: string): Promise<number> {
  const [invSnap, legacySnap] = await Promise.all([
    db
      .collection(ORGANIZATION_INVITES_COLLECTION)
      .where("organization_id", "==", orgId)
      .where("status", "==", "pending")
      .get(),
    db
      .collection("organization_seats")
      .where("organization_id", "==", orgId)
      .where("status", "==", "pending")
      .get(),
  ]);
  return invSnap.size + legacySnap.size;
}

export async function findPendingInvitesByOrgAndEmail(
  db: Firestore,
  orgId: string,
  emailLower: string
): Promise<QueryDocumentSnapshot[]> {
  const [a, b] = await Promise.all([
    db
      .collection(ORGANIZATION_INVITES_COLLECTION)
      .where("organization_id", "==", orgId)
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .get(),
    db
      .collection("organization_seats")
      .where("organization_id", "==", orgId)
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .get(),
  ]);
  return [...a.docs, ...b.docs];
}

export async function emailHasPendingInviteForOrg(
  db: Firestore,
  orgId: string,
  emailLower: string
): Promise<boolean> {
  const [a, b] = await Promise.all([
    db
      .collection(ORGANIZATION_INVITES_COLLECTION)
      .where("organization_id", "==", orgId)
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
    db
      .collection("organization_seats")
      .where("organization_id", "==", orgId)
      .where("email", "==", emailLower)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
  ]);
  return !a.empty || !b.empty;
}
