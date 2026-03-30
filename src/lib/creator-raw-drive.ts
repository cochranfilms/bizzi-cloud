import type { LinkedDrive } from "@/types/backup";

/** True when `driveId` refers to any linked drive marked Creator RAW (including org-shared RAW). */
export function isCreatorRawDriveId(
  driveId: string | null | undefined,
  linkedDrives: Pick<LinkedDrive, "id" | "is_creator_raw">[]
): boolean {
  if (!driveId) return false;
  return linkedDrives.some((d) => d.id === driveId && d.is_creator_raw === true);
}
