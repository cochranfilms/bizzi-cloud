"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Cloud, Folder } from "lucide-react";
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
import { DND_MOVE_MIME } from "@/lib/dnd-move-items";
import type { RecentFile } from "@/hooks/useCloudFiles";
import type { DisplayContext } from "@/lib/metadata-display";
import type { FolderRollupCoverage } from "@/lib/metadata-display";
import { buildFolderDisplayMetadata } from "@/lib/metadata-display";

interface FolderListRowProps {
  item: FolderItem;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  isDropTarget?: boolean;
  onItemsDropped?: (targetDriveId: string, e: React.DragEvent) => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLTableRowElement>;
  /** Virtual-folder rollup; omit for drive rows (count-only display). */
  folderRollup?: {
    descendants: RecentFile[];
    coverage: FolderRollupCoverage;
  };
  displayContext?: DisplayContext;
  /** Location when browsing inside a drive (virtual folders). */
  currentDriveName?: string | null;
  columnMode?: "full" | "projects";
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
  draggable = false,
  onDragStart,
  folderRollup,
  displayContext,
  currentDriveName,
  columnMode = "full",
}: FolderListRowProps) {
  const rollup = folderRollup ?? {
    descendants: [] as RecentFile[],
    coverage: "none" as FolderRollupCoverage,
  };
  const display = useMemo(
    () =>
      buildFolderDisplayMetadata({
        item,
        coverage: rollup.coverage,
        descendants: rollup.descendants,
        context: displayContext,
        currentDriveName: currentDriveName ?? null,
      }),
    [item, rollup.coverage, rollup.descendants, displayContext, currentDriveName]
  );
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
      ? Cloud
      : Folder;

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLTableRowElement>) => {
      if (!isDropTarget || !onItemsDropped) return;
      if (!Array.from(e.dataTransfer.types).includes(DND_MOVE_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      setIsDragOver(true);
    },
    [isDropTarget, onItemsDropped]
  );

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLTableRowElement>) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLTableRowElement>) => {
      setIsDragOver(false);
      if (!isDropTarget || !onItemsDropped || !item.driveId) return;
      e.preventDefault();
      e.stopPropagation();
      onItemsDropped(item.driveId, e);
    },
    [isDropTarget, onItemsDropped, item.driveId]
  );

  return (
    <>
      <tr
        data-selectable-item
        data-item-type="folder"
        data-item-key={item.key}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={isDropTarget ? handleDragOver : undefined}
        onDragLeave={isDropTarget ? handleDragLeave : undefined}
        onDrop={isDropTarget ? handleDrop : undefined}
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
        } ${selected ? "bg-bizzi-blue/5 dark:bg-bizzi-blue/10" : ""} ${
          draggable ? "cursor-grab active:cursor-grabbing" : ""
        } ${
          isDragOver ? "bg-bizzi-blue/10 ring-1 ring-inset ring-bizzi-blue/40 dark:bg-bizzi-blue/15" : ""
        }`}
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
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {display.typeLabel}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {display.sizeLabel}
        </td>
        <td
          className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400"
          title={display.tooltips?.modified}
        >
          {display.modifiedLabel}
        </td>
        <td
          className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400"
          title={display.tooltips?.location}
        >
          {display.locationLabel}
        </td>
        {columnMode === "full" ? (
          <>
            <td
              className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400"
              title={display.tooltips?.resolution}
            >
              {display.resolutionLabel}
            </td>
            <td
              className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400"
              title={display.tooltips?.duration}
            >
              {display.durationLabel}
            </td>
            <td
              className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400"
              title={display.tooltips?.codec}
            >
              {display.codecLabel}
            </td>
          </>
        ) : null}
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
