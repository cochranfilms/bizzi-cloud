/**
 * Choose which Storage drive to use for uploads so personal vs team attribution stays correct.
 */
import type { LinkedDrive } from "@/types/backup";

const baseName = (name: string) => name.replace(/^\[Team\]\s+/, "");

const isStorageName = (d: Pick<LinkedDrive, "name">) => {
  const n = baseName(d.name);
  return n === "Storage" || n === "Uploads";
};

/** Main /dashboard: Storage pillar with no org and no personal_team_owner_id on the drive row. */
export function pickStrictPersonalStorageDrive(
  drives: LinkedDrive[]
): LinkedDrive | undefined {
  return drives.find(
    (d) =>
      isStorageName(d) &&
      !d.organization_id &&
      !d.personal_team_owner_id
  );
}

/** /team/[ownerId]: team workspace Storage pillar for that owner. */
export function pickTeamWorkspaceStorageDrive(
  drives: LinkedDrive[],
  teamOwnerUid: string
): LinkedDrive | undefined {
  return drives.find(
    (d) =>
      isStorageName(d) &&
      !d.organization_id &&
      d.personal_team_owner_id === teamOwnerUid
  );
}
