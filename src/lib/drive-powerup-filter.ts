/**
 * Filter drives and folders by power-up access.
 * RAW folder requires editor or fullframe addon.
 * Gallery Media folder requires gallery or fullframe addon.
 * Storage folder is always visible for paid plans.
 */

import type { LinkedDrive } from "@/types/backup";
import type { DriveFolder } from "@/hooks/useCloudFiles";

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
