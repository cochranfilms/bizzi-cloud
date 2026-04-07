/**
 * Enterprise pillar drives: one Storage / RAW / Gallery linked drive per seat (V2 folder model).
 * Legacy org `is_org_shared` drives are not merged into listings or queries.
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";

export async function resolveEnterprisePillarDriveIds(
  organizationId: string,
  memberDriveId: string
): Promise<string[]> {
  const db = getAdminFirestore();
  const driveSnap = await db.collection("linked_drives").doc(memberDriveId).get();
  if (!driveSnap.exists) return [memberDriveId];

  const driveData = driveSnap.data();
  if (driveData?.organization_id !== organizationId || driveData?.deleted_at) {
    return [memberDriveId];
  }

  return [memberDriveId];
}

/**
 * Canonical workspace id for "share with this organization" — Shared Library (storage pillar)
 * org_shared workspace. One row per org in share pickers; avoids listing private/team workspaces.
 */
export async function getOrgWideShareTargetWorkspaceId(
  organizationId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("workspaces")
    .where("organization_id", "==", organizationId)
    .where("workspace_type", "==", "org_shared")
    .get();

  if (snap.empty) return null;

  let storage: QueryDocumentSnapshot | null = null;
  let byName: QueryDocumentSnapshot | null = null;
  let first: QueryDocumentSnapshot | null = null;

  for (const doc of snap.docs) {
    if (!first) first = doc;
    const data = doc.data();
    const driveType = data.drive_type as string | undefined;
    const name = String(data.name ?? "").toLowerCase();
    if (driveType === "storage") storage = doc;
    if (name === "shared library") byName = doc;
  }

  if (storage) return storage.id;
  if (byName) return byName.id;
  return first?.id ?? null;
}

/**
 * Resolve canonical org_shared workspace ids for many organizations in one read pass
 * (same pick order as {@link getOrgWideShareTargetWorkspaceId} per org).
 */
export async function getOrgWideShareTargetWorkspaceIdMap(
  limitDocs = 2500
): Promise<Map<string, string>> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("workspaces")
    .where("workspace_type", "==", "org_shared")
    .limit(limitDocs)
    .get();

  const byOrg = new Map<string, QueryDocumentSnapshot[]>();
  for (const doc of snap.docs) {
    const oid = doc.data().organization_id as string | undefined;
    if (!oid?.trim()) continue;
    const key = oid.trim();
    const arr = byOrg.get(key) ?? [];
    arr.push(doc);
    byOrg.set(key, arr);
  }

  const out = new Map<string, string>();
  for (const [oid, docs] of byOrg) {
    let storage: QueryDocumentSnapshot | null = null;
    let byName: QueryDocumentSnapshot | null = null;
    let first: QueryDocumentSnapshot | null = null;
    for (const doc of docs) {
      if (!first) first = doc;
      const data = doc.data();
      const driveType = data.drive_type as string | undefined;
      const name = String(data.name ?? "").toLowerCase();
      if (driveType === "storage") storage = doc;
      if (name === "shared library") byName = doc;
    }
    const pick = storage ?? byName ?? first;
    if (pick) out.set(oid, pick.id);
  }
  return out;
}
