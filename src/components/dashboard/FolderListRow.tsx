"use client";

import { useState } from "react";
import { Check, Folder } from "lucide-react";
import BizzicloudStorageIcon from "@/components/icons/BizzicloudStorageIcon";
import type { FolderItem } from "./FolderCard";
import ItemActionsMenu from "./ItemActionsMenu";
import ShareModal from "./ShareModal";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { useConfirm } from "@/hooks/useConfirm";

interface FolderListRowProps {
  item: FolderItem;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  isDropTarget?: boolean;
  onItemsDropped?: (targetDriveId: string, e: React.DragEvent) => void;
}

export default function FolderListRow({
  item,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  isDropTarget = false,
  onItemsDropped,
}: FolderListRowProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const canNavigate = (!!item.driveId || item.virtualFolder === true) && !!onClick;
  const { renameFolder, moveFolderContentsToFolder } = useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });
  const { isPinned, pinItem, unpinItem } = usePinned();
  const folderPinned = !!item.driveId && isPinned("folder", item.driveId);
  const { confirm } = useConfirm();

  const handleDelete = async () => {
    const ok = await confirm({
      message: `Delete "${item.name}"? This will unlink the drive and remove it from your backups.`,
      destructive: true,
    });
    if (ok) onDelete?.();
  };

  const Icon = item.customIcon
    ? item.customIcon
    : item.name === "Storage" || item.name === "Uploads"
      ? BizzicloudStorageIcon
      : Folder;

  return (
    <>
      <tr
        data-selectable-item
        data-item-type="folder"
        data-item-key={item.key}
        role={canNavigate ? "button" : undefined}
        tabIndex={canNavigate ? 0 : undefined}
        onClick={canNavigate ? onClick : undefined}
        onKeyDown={
          canNavigate
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        className={`border-b border-neutral-100 transition-colors last:border-0 ${
          canNavigate ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50" : ""
        } ${selected ? "bg-bizzi-blue/5 dark:bg-bizzi-blue/10" : ""}`}
      >
        <td className="w-10 px-3 py-2">
          {selectable && onSelect ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              className="flex h-6 w-6 items-center justify-center rounded border-2 border-neutral-300 dark:border-neutral-600"
              aria-label={selected ? "Deselect" : "Select"}
            >
              {selected && <Check className="h-3.5 w-3.5 text-bizzi-blue" />}
            </button>
          ) : null}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-neutral-100 dark:bg-neutral-800">
              <Icon className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
            </div>
            <span className="truncate font-medium text-neutral-900 dark:text-white" title={item.name}>
              {item.name}
            </span>
          </div>
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">Folder</td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {item.items} {item.items === 1 ? "item" : "items"}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">—</td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">—</td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">—</td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">—</td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">—</td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {(onDelete || (!item.hideShare && item.driveId)) && (
              <ItemActionsMenu
                actions={[
                  ...(!item.hideShare && item.driveId
                    ? [
                        {
                          id: "share",
                          label: "Share",
                          icon: undefined,
                          onClick: () => setShareOpen(true),
                        },
                      ]
                    : []),
                  ...(item.driveId
                    ? [
                        {
                          id: folderPinned ? "unpin" : "pin",
                          label: folderPinned ? "Unpin" : "Pin",
                          icon: undefined,
                          onClick: () =>
                            folderPinned
                              ? unpinItem("folder", item.driveId!)
                              : pinItem("folder", item.driveId!),
                        },
                        ...(!item.preventRename
                          ? [
                              {
                                id: "rename",
                                label: "Rename",
                                icon: undefined,
                                onClick: () => setRenameOpen(true),
                              },
                            ]
                          : []),
                        ...(!item.preventMove
                          ? [
                              {
                                id: "move",
                                label: "Move",
                                icon: undefined,
                                onClick: () => setMoveOpen(true),
                              },
                              {
                                id: "create-folder",
                                label: "Create New Folder",
                                icon: undefined,
                                onClick: () => setCreateFolderOpen(true),
                              },
                            ]
                          : []),
                    ]
                    : []),
                  ...(onDelete && !item.preventDelete
                    ? [
                        {
                          id: "delete",
                          label: "Delete",
                          onClick: handleDelete,
                          destructive: true,
                        },
                      ]
                    : []),
                ]}
                ariaLabel="Folder actions"
                alignRight
              />
            )}
          </div>
        </td>
      </tr>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        folderName={item.name}
        linkedDriveId={item.driveId}
      />
      {item.driveId && (
        <>
          <RenameModal
            open={renameOpen}
            onClose={() => setRenameOpen(false)}
            currentName={item.name}
            onRename={(newName) => renameFolder(item.driveId!, newName)}
            itemType="folder"
          />
          <MoveModal
            open={moveOpen}
            onClose={() => setMoveOpen(false)}
            itemName={item.name}
            itemType="folder"
            excludeDriveId={item.driveId}
            folders={visibleLinkedDrives}
            onMove={(targetDriveId) => moveFolderContentsToFolder(item.driveId!, targetDriveId)}
          />
          <CreateFolderModal
            open={createFolderOpen}
            onClose={() => setCreateFolderOpen(false)}
            selectedFolderKeys={[item.key]}
            onCreateAndMove={async (folderName) => {
              const drive = await createFolder(folderName);
              await moveFolderContentsToFolder(item.driveId!, drive.id);
            }}
          />
        </>
      )}
    </>
  );
}
