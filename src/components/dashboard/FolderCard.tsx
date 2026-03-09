"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Cloud, Folder, Share2, Pencil, FolderInput, FolderPlus, Pin } from "lucide-react";
import { useCallback, useState } from "react";
import ShareModal from "./ShareModal";
import ItemActionsMenu from "./ItemActionsMenu";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { useConfirm } from "@/hooks/useConfirm";

export interface FolderItem {
  name: string;
  type: "folder";
  key: string;
  items: number;
  isShared?: boolean;
  /** Hide share button (e.g. for synced drives) */
  hideShare?: boolean;
  /** Drive ID for navigation (when clickable) */
  driveId?: string;
  /** Custom icon (e.g. Film for RAW folder) */
  customIcon?: LucideIcon;
  /** When true, folder cannot be deleted (e.g. permanent RAW) */
  preventDelete?: boolean;
  /** When true, folder cannot be renamed (e.g. permanent RAW) */
  preventRename?: boolean;
  /** When true, use accent styling (darker blue bg, lighter icon) - for Storage & RAW */
  isSystemFolder?: boolean;
  /** When true, folder cannot be moved (e.g. permanent system folders) */
  preventMove?: boolean;
  /** When true, folder is a virtual subfolder (e.g. gallery name in Gallery Media) - clickable via onClick without driveId */
  virtualFolder?: boolean;
  /** When set, path prefix for navigation (e.g. gallery ID); use instead of name for path filtering */
  pathPrefix?: string;
}

interface FolderCardProps {
  item: FolderItem;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  /** When true, folder can accept drag-and-drop of items to move into it */
  isDropTarget?: boolean;
  /** Called when items are dropped on this folder; parent extracts fileIds/folderKeys from event */
  onItemsDropped?: (targetDriveId: string, e: React.DragEvent) => void;
}

export default function FolderCard({
  item,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  isDropTarget = false,
  onItemsDropped,
}: FolderCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const canNavigate = (!!item.driveId || item.virtualFolder === true) && !!onClick;
  const { renameFolder, moveFolderContentsToFolder } = useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();
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

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDropTarget || !onItemsDropped) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    },
    [isDropTarget, onItemsDropped]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      setIsDragOver(false);
      if (!isDropTarget || !onItemsDropped || !item.driveId) return;
      e.preventDefault();
      e.stopPropagation();
      onItemsDropped(item.driveId, e);
    },
    [isDropTarget, onItemsDropped, item.driveId]
  );

  const isSystemFolder = item.isSystemFolder === true;

  return (
    <>
      <div
        className={`group relative flex flex-col items-center rounded-xl border p-6 transition-colors ${
          isSystemFolder
            ? "border-bizzi-blue bg-bizzi-blue dark:border-bizzi-cyan/80 dark:bg-bizzi-blue"
            : selected
              ? "border-bizzi-blue ring-2 ring-bizzi-blue/50 bg-bizzi-blue/5 dark:border-bizzi-blue dark:bg-bizzi-blue/10"
              : isDragOver
                ? "border-bizzi-blue ring-2 ring-bizzi-blue/30 bg-bizzi-blue/10 dark:border-bizzi-blue dark:bg-bizzi-blue/20"
                : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
        } ${
          canNavigate && !selected
            ? isSystemFolder
              ? "cursor-pointer hover:ring-2 hover:ring-white/30 dark:hover:ring-bizzi-cyan/40"
              : "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
            : canNavigate && selected
              ? "cursor-pointer"
              : ""
        }`}
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
        onDragOver={isDropTarget ? handleDragOver : undefined}
        onDragLeave={isDropTarget ? handleDragLeave : undefined}
        onDrop={isDropTarget ? handleDrop : undefined}
      >
        {selectable && onSelect && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
              selected
                ? "border-bizzi-blue bg-bizzi-blue dark:border-bizzi-blue dark:bg-bizzi-blue"
                : "border-neutral-300 bg-transparent dark:border-neutral-600"
            }`}
            aria-label={selected ? "Deselect" : "Select"}
            aria-pressed={selected}
          >
            {selected && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
          </button>
        )}
        <div className="relative mb-3">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-xl ${
              isSystemFolder
                ? "bg-white/20 text-white dark:bg-white/25 dark:text-bizzi-cyan"
                : "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
            }`}
          >
            {item.customIcon ? (
              <item.customIcon className="h-8 w-8" />
            ) : item.name === "Storage" ? (
              <Cloud className="h-8 w-8" />
            ) : (
              <Folder className="h-8 w-8" />
            )}
          </div>
          {item.isShared && (
            <div className="absolute -right-1 -top-1 rounded-full bg-bizzi-blue p-1">
              <Share2 className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <h3
          className={`mb-1 w-full truncate text-center text-sm font-medium ${
            isSystemFolder ? "text-white dark:text-white" : "text-neutral-900 dark:text-white"
          }`}
        >
          {item.name}
        </h3>
        <p
          className={`text-xs ${isSystemFolder ? "text-white/90 dark:text-bizzi-cyan/90" : "text-neutral-500 dark:text-neutral-400"}`}
        >
          {item.items} {item.items === 1 ? "item" : "items"}
        </p>
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!item.hideShare && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShareOpen(true);
              }}
              className={`rounded-lg p-2 ${
                isSystemFolder
                  ? "hover:bg-white/20"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-700"
              }`}
              aria-label="Share folder"
            >
              <Share2
                className={`h-4 w-4 ${isSystemFolder ? "text-white/90" : "text-neutral-500 dark:text-neutral-400"}`}
              />
            </button>
          )}
          {(onDelete || (!item.hideShare && item.driveId)) && (
            <ItemActionsMenu
              actions={[
                ...(!item.hideShare && item.driveId
                  ? [
                      {
                        id: "share",
                        label: "Share",
                        icon: <Share2 className="h-4 w-4" />,
                        onClick: () => setShareOpen(true),
                      },
                    ]
                  : []),
                ...(item.driveId
                  ? [
                      {
                        id: folderPinned ? "unpin" : "pin",
                        label: folderPinned ? "Unpin" : "Pin",
                        icon: <Pin className="h-4 w-4" />,
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
                              icon: <Pencil className="h-4 w-4" />,
                              onClick: () => setRenameOpen(true),
                            },
                          ]
                        : []),
                      ...(!item.preventMove
                        ? [
                            {
                              id: "move",
                              label: "Move",
                              icon: <FolderInput className="h-4 w-4" />,
                              onClick: () => setMoveOpen(true),
                            },
                            {
                              id: "create-folder",
                              label: "Create New Folder",
                              icon: <FolderPlus className="h-4 w-4" />,
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
      </div>

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
            folders={linkedDrives}
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
