import type { LinkedDrive } from "@/types/backup";
import { teamAwareBaseDriveName } from "@/lib/storage-folder-model-policy";

export function isLinkedDriveFolderModelV2(d: LinkedDrive | undefined): boolean {
  return d?.folder_model_version === 2;
}

/** Storage or Gallery Media (not RAW) on folder model v2 — same listing + navigation as Inline Storage V2. */
export function isStorageFoldersV2PillarDrive(d: LinkedDrive | undefined): boolean {
  if (!d || d.is_creator_raw === true || !isLinkedDriveFolderModelV2(d)) return false;
  const base = teamAwareBaseDriveName(d.name);
  return base === "Storage" || base === "Gallery Media";
}
