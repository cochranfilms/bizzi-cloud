/**
 * Filter drives and folders by power-up access.
 * RAW folder requires editor or fullframe addon.
 * Gallery Media folder requires gallery or fullframe addon.
 * Storage folder is always visible for paid plans.
 */

import type { LinkedDrive } from "@/types/backup";
import type { DriveFolder } from "@/hooks/useCloudFiles";

/** Strip optional team prefix so "[Team] RAW" sorts as RAW. */
export function linkedDriveBaseName(name: string): string {
  return name.replace(/^\[Team\]\s+/, "").trim();
}

/**
 * Drives allowed as targets in Move / Bulk Move modals: Storage (and legacy "Uploads"),
 * plus user-created linked folders — not Gallery Media, not RAW/Creator RAW.
 */
export function filterLinkedDrivesForMoveTargets(drives: LinkedDrive[]): LinkedDrive[] {
  const filtered = drives.filter((d) => {
    if (d.is_creator_raw === true) return false;
    const base = linkedDriveBaseName(d.name);
    if (base === "Gallery Media") return false;
    if (base === "RAW") return false;
    return true;
  });
  const tier = (d: LinkedDrive): number => {
    const b = linkedDriveBaseName(d.name);
    if (b === "Storage") return 0;
    if (b === "Uploads") return 1;
    return 2;
  };
  return [...filtered].sort((a, b) => {
    const dt = tier(a) - tier(b);
    if (dt !== 0) return dt;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function linkedDrivesEligibleAsMoveDestination(
  drives: LinkedDrive[],
  powerUp: { hasEditor: boolean; hasGallerySuite: boolean }
): LinkedDrive[] {
  return filterLinkedDrivesForMoveTargets(filterLinkedDrivesByPowerUp(drives, powerUp));
}

export function filterLinkedDrivesByPowerUp(
  drives: LinkedDrive[],
  options: { hasEditor: boolean; hasGallerySuite: boolean }
): LinkedDrive[] {
  const { hasEditor, hasGallerySuite } = options;
  return drives.filter((d) => {
    if (d.name === "Storage") return true;
    if (d.is_creator_raw) return hasEditor;
    if (d.name === "Gallery Media") return hasGallerySuite;
    return true; // user-created folders
  });
}

export function filterDriveFoldersByPowerUp(
  folders: DriveFolder[],
  options: { hasEditor: boolean; hasGallerySuite: boolean }
): DriveFolder[] {
  const { hasEditor, hasGallerySuite } = options;
  return folders.filter((d) => {
    if (d.name === "Storage") return true;
    if (d.isCreatorRaw) return hasEditor;
    if (d.name === "Gallery Media") return hasGallerySuite;
    return true; // user-created folders
  });
}
