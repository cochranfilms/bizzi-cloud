/**
 * Enterprise pillar drives: member "main" Storage / RAW / Gallery drives pair with org_shared drives.
 * Used to show one unified file list per pillar (member private + org shared).
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

  const currentDriveType: "storage" | "raw" | "gallery" =
    driveData?.is_creator_raw === true
      ? "raw"
      : (driveData?.name ?? "").toLowerCase().includes("gallery")
        ? "gallery"
        : "storage";

  const sharedDrivesSnap = await db
    .collection("linked_drives")
    .where("organization_id", "==", organizationId)
    .where("is_org_shared", "==", true)
    .get();

  const sharedByName: Record<string, string> = {};
  for (const d of sharedDrivesSnap.docs) {
    const name = (d.data().name ?? "").toLowerCase();
    if (name.includes("storage")) sharedByName.storage = d.id;
    else if (name.includes("raw")) sharedByName.raw = d.id;
    else if (name.includes("gallery")) sharedByName.gallery = d.id;
  }

  const orgSharedId = sharedByName[currentDriveType] ?? null;
  const ids = [memberDriveId];
  if (orgSharedId && orgSharedId !== memberDriveId) ids.push(orgSharedId);
  return ids;
}

/**
 * Shared pillar (org_shared) drive + workspace for a member's pillar drive, when Shared Storage/RAW/Gallery exist.
 * Used so enterprise uploads land in the shared library visible to all seat members (team-like workflow).
 */
export async function getOrgSharedUploadTarget(
  organizationId: string,
  memberDriveId: string
): Promise<{ workspaceId: string; sharedDriveId: string } | null> {
  const db = getAdminFirestore();
  const pillarIds = await resolveEnterprisePillarDriveIds(organizationId, memberDriveId);
  for (const driveId of pillarIds) {
    if (driveId === memberDriveId) continue;
    const dSnap = await db.collection("linked_drives").doc(driveId).get();
    if (!dSnap.exists || dSnap.data()?.deleted_at) continue;
    if (dSnap.data()?.is_org_shared !== true) continue;
    const wsSnap = await db
      .collection("workspaces")
      .where("organization_id", "==", organizationId)
      .where("drive_id", "==", driveId)
      .where("workspace_type", "==", "org_shared")
      .limit(1)
      .get();
    if (wsSnap.empty) continue;
    return { workspaceId: wsSnap.docs[0].id, sharedDriveId: driveId };
  }
  return null;
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
