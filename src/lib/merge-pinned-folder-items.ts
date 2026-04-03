import type { FolderItem } from "@/components/dashboard/FolderCard";
import type { LinkedDrive } from "@/types/backup";
import { parseStorageV2FolderPinId } from "@/lib/storage-v2-folder-pin";

/** Combines linked-drive pins with Storage v2 subfolder pins for Home / All files. */
export function mergePinnedFolderItems(
  folderItems: FolderItem[],
  pinnedFolderIds: Set<string>,
  pinnedFolderLabels: Map<string, string>,
  linkedDrives: LinkedDrive[],
  teamAwareDriveName: (n: string) => string
): FolderItem[] {
  const fromDrives = folderItems.filter((f) => f.driveId && pinnedFolderIds.has(f.driveId));
  const v2Items: FolderItem[] = [];
  for (const pinId of pinnedFolderIds) {
    const parsed = parseStorageV2FolderPinId(pinId);
    if (!parsed) continue;
    const { linkedDriveId, storageFolderId } = parsed;
    const drive = linkedDrives.find((d) => d.id === linkedDriveId);
    const name =
      pinnedFolderLabels.get(pinId) ??
      (drive ? `Folder in ${teamAwareDriveName(drive.name)}` : "Storage folder");
    v2Items.push({
      name,
      type: "folder",
      key: `pinned-v2-${pinId}`,
      items: 0,
      driveId: linkedDriveId,
      storageFolderId,
      storageLinkedDriveId: linkedDriveId,
      hideShare: true,
      preventDelete: true,
      preventMove: true,
      preventRename: true,
      virtualFolder: true,
    });
  }
  return [...fromDrives, ...v2Items];
}
