/**
 * Product policy: Storage folder model v2 (`storage_folders` + `folder_id` on `backup_files`)
 * is the canonical tree. New “general purpose” folders MUST NOT create additional `linked_drives`.
 *
 * - Legacy linked drives (custom backup folders) are frozen for creation when v2 Storage exists.
 * - Users consolidate legacy drives into Storage via the migration assistant (API + UI).
 * - Shared-folder and Creator/RAW flows may still create `linked_drives` where required.
 */

import type { LinkedDrive } from "@/types/backup";

export const CANONICAL_FOLDER_MODEL_VERSION = 2 as const;

/** Strip optional “[Team] ”-style prefix for pillar name checks. */
export function teamAwareBaseDriveName(name: string): string {
  return name.replace(/^\[Team\]\s+/, "");
}

export function findCanonicalStorageV2Drive(
  drives: LinkedDrive[],
): LinkedDrive | undefined {
  const candidates = drives.filter(
    (d) =>
      teamAwareBaseDriveName(d.name) === "Storage" &&
      d.is_creator_raw !== true &&
      d.folder_model_version === CANONICAL_FOLDER_MODEL_VERSION,
  );
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];
  const createdMs = (x: LinkedDrive) =>
    x.created_at ? Date.parse(x.created_at) : Number.MAX_SAFE_INTEGER;
  return candidates.reduce((a, b) => (createdMs(a) <= createdMs(b) ? a : b));
}

/** When true, normal users must not create new general-purpose linked drives (use Storage v2). */
export function shouldFreezeNewLegacyLinkedDriveFolders(drives: LinkedDrive[]): boolean {
  return findCanonicalStorageV2Drive(drives) !== undefined;
}

export function isSystemPillarLinkedDrive(d: Pick<LinkedDrive, "name" | "is_creator_raw">): boolean {
  const base = teamAwareBaseDriveName(d.name);
  return (
    base === "Storage" || d.is_creator_raw === true || base === "RAW" || base === "Gallery Media"
  );
}

/**
 * A separate linked drive that should be offered “Consolidate into Storage” (not RAW/Gallery/Storage pillar).
 */
export function isLegacyCustomLinkedDriveForConsolidation(d: LinkedDrive): boolean {
  if (d.consolidated_into_storage_folder_id) return false;
  if (d.is_creator_raw === true) return false;
  if (d.creator_section === true) return false;
  if (d.is_org_shared === true) return false;
  if (isSystemPillarLinkedDrive(d)) return false;
  return true;
}
