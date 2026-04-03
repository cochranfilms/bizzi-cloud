/**
 * User-facing copy for move / folder naming guards (linked drives + Storage v2).
 */

export const MOVE_ALREADY_AT_DESTINATION =
  "Those items are already in this folder. You can't move them here again.";

export const DUPLICATE_LINKED_FOLDER_NAME =
  "A folder with this name already exists. Choose a different name.";

/** Normalize linked drive labels for duplicate detection ([Team] prefix, Uploads→Storage). */
export function linkedDriveDisplayKey(raw: string): string {
  let s = raw.replace(/^\[Team\]\s+/, "").trim().toLowerCase();
  if (s === "uploads") s = "storage";
  return s;
}
