"use client";

import type { LucideIcon } from "lucide-react";
import type { CardSize, AspectRatio } from "@/context/LayoutSettingsContext";
import type { CardPresentation } from "@/lib/card-presentation";
import { getCardAspectClass } from "@/lib/card-aspect-utils";
import { Check, Cloud, Folder, Share2, Pencil, FolderInput, FolderPlus, Pin } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { DND_MOVE_MIME } from "@/lib/dnd-move-items";
import ShareModal from "./ShareModal";
import ItemActionsMenu from "./ItemActionsMenu";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";
import StorageFolderTreePickerModal from "./StorageFolderTreePickerModal";
import {
  actorMayMutateLinkedDriveContents,
  useCloudFiles,
} from "@/hooks/useCloudFiles";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import {
  storageFolderRowActiveForUi,
  storageFolderRowReadyForUi,
} from "@/lib/storage-folders/folder-operation-state-client";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
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
  /** When set, path prefix for navigation (e.g. gallery media_folder_segment); use instead of name for path filtering */
  pathPrefix?: string;
  /** Folder model v2: `storage_folders` document id */
  storageFolderId?: string;
  /** V2: linked Storage drive id for API calls */
  storageLinkedDriveId?: string;
  storageFolderVersion?: number;
  storageFolderOperationState?: string;
  storageFolderLifecycleState?: string;
  /** Gallery Media drive root tile: canonical galleries document id (rollup / dedupe); paths use pathPrefix */
  galleryMediaCanonicalId?: string;
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
  /** Layout: card size (small/medium/large) */
  layoutSize?: CardSize;
  /** Layout: aspect ratio of the card (video = 16:9) */
  layoutAspectRatio?: AspectRatio | "video";
  /** Layout: whether to show metadata (item count) */
  showCardInfo?: boolean;
  /** Thumbnail browse mode: container-style folder tile */
  presentation?: CardPresentation;
  /** v2 Storage: drive display name for tree picker */
  storagePickerDriveLabel?: string;
  onStorageFolderMutated?: () => void;
}

// Scaled so largest never exceeds former medium; large = former medium
const SIZE_CLASSES = {
  small: { padding: "p-3", icon: "h-8 w-8", iconInner: "h-4 w-4", text: "text-xs" },
  medium: { padding: "p-4", icon: "h-10 w-10", iconInner: "h-5 w-5", text: "text-xs" },
  large: { padding: "p-6", icon: "h-16 w-16", iconInner: "h-8 w-8", text: "text-sm" },
} as const;

export default function FolderCard({
  item,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  isDropTarget = false,
  onItemsDropped,
  layoutSize = "medium",
  layoutAspectRatio = "landscape",
  showCardInfo = true,
  presentation = "default",
  storagePickerDriveLabel,
  onStorageFolderMutated,
}: FolderCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [v2StoragePickerOpen, setV2StoragePickerOpen] = useState(false);
  const pathname = usePathname();
  const isEnterpriseContext =
    typeof pathname === "string" && pathname.startsWith("/enterprise");
  const { user } = useAuth();
  const { org, role: orgRole } = useEnterprise();
  const canNavigate = (!!item.driveId || item.virtualFolder === true) && !!onClick;
  const { renameFolder, moveFolderContentsToFolder, renameStorageFolder, moveStorageFolder } =
    useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();

  const allowV2FolderMutations = useMemo(() => {
    if (
      !item.storageFolderId ||
      !item.storageLinkedDriveId ||
      item.storageFolderVersion == null ||
      !user
    ) {
      return false;
    }
    const drive = linkedDrives.find((d) => d.id === item.storageLinkedDriveId);
    if (
      !actorMayMutateLinkedDriveContents(drive, user.uid, {
        enterpriseOrgId: org?.id,
        enterpriseRole: orgRole,
        isEnterpriseContext,
      })
    ) {
      return false;
    }
    if (
      !storageFolderRowActiveForUi({
        lifecycle_state: item.storageFolderLifecycleState ?? "active",
      })
    ) {
      return false;
    }
    if (
      !storageFolderRowReadyForUi({
        operation_state: item.storageFolderOperationState,
        pending_operation: null,
      })
    ) {
      return false;
    }
    return true;
  }, [
    item.storageFolderId,
    item.storageLinkedDriveId,
    item.storageFolderVersion,
    item.storageFolderLifecycleState,
    item.storageFolderOperationState,
    user,
    linkedDrives,
    org?.id,
    orgRole,
    isEnterpriseContext,
  ]);
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

  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDropTarget || !onItemsDropped) return;
      if (!Array.from(e.dataTransfer.types).includes(DND_MOVE_MIME)) return;
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
  const useThumbChrome = presentation === "thumbnail" && !isSystemFolder;
  const sizeClasses = SIZE_CLASSES[layoutSize];
  const aspectClass = getCardAspectClass(layoutAspectRatio ?? "landscape");
  /** Full-width 16:9 tiles are huge on phones; base folders use a compact row on small screens. */
  const aspectShell = isSystemFolder ? "max-sm:aspect-auto sm:aspect-video" : aspectClass;
  const systemMobileShell = isSystemFolder
    ? "max-sm:min-h-0 max-sm:flex-row max-sm:items-center max-sm:justify-start max-sm:gap-0 max-sm:py-3 max-sm:pl-3 max-sm:pr-[3.5rem] max-sm:!p-3"
    : "";
  const iconBoxClass = `${sizeClasses.icon} max-sm:!h-12 max-sm:!w-12`;
  const iconInnerClass = `${sizeClasses.iconInner} max-sm:!h-5 max-sm:!w-5`;

  const defaultGridShell = `group touch-manipulation relative flex min-w-0 flex-col items-center justify-center overflow-hidden rounded-xl border transition-colors ${sizeClasses.padding} ${aspectShell} ${systemMobileShell} ${
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
        ? "cursor-pointer hover:ring-2 hover:ring-white/30 active:opacity-95 dark:hover:ring-bizzi-cyan/40"
        : "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
      : canNavigate && selected
        ? "cursor-pointer"
        : ""
  }`;

  const thumbBrowseShell = `group touch-manipulation relative flex min-w-0 flex-col overflow-hidden rounded-2xl transition-all ${
    selected
      ? "ring-2 ring-bizzi-blue ring-offset-2 ring-offset-white shadow-md shadow-bizzi-blue/20 dark:ring-bizzi-cyan dark:ring-offset-neutral-950 dark:shadow-bizzi-cyan/25"
      : isDragOver
        ? "ring-2 ring-bizzi-blue/60 bg-bizzi-blue/10 dark:ring-bizzi-cyan/50"
        : "ring-1 ring-neutral-200/80 bg-neutral-100/45 dark:ring-neutral-700/55 dark:bg-neutral-900/40"
  } ${
    canNavigate && !selected && !isDragOver
      ? "cursor-pointer hover:ring-neutral-300 hover:shadow-sm dark:hover:ring-neutral-600"
      : canNavigate
        ? "cursor-pointer"
        : ""
  }`;

  const itemCountLine = `${item.items} ${item.items === 1 ? "item" : "items"}`;

  return (
    <>
      <div
        className={useThumbChrome ? thumbBrowseShell : defaultGridShell}
        role={canNavigate ? "button" : undefined}
        tabIndex={canNavigate ? 0 : undefined}
        aria-label={canNavigate && useThumbChrome && !showCardInfo ? item.name : undefined}
        title={useThumbChrome && !showCardInfo ? item.name : undefined}
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
            className={`absolute left-2 top-2 z-20 flex items-center justify-center rounded-md border-2 transition-colors ${
              useThumbChrome
                ? "h-5 w-5 border-white/60 bg-black/40 backdrop-blur-sm hover:bg-black/55 dark:border-white/50"
                : "z-10 h-6 w-6 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            } ${
              selected
                ? "border-bizzi-blue bg-bizzi-blue dark:border-bizzi-blue dark:bg-bizzi-blue"
                : useThumbChrome
                  ? "border-white/60 bg-black/35"
                  : "border-neutral-300 bg-transparent dark:border-neutral-600"
            }`}
            aria-label={selected ? "Deselect" : "Select"}
            aria-pressed={selected}
          >
            {selected && (
              <Check className={`${useThumbChrome ? "h-3 w-3" : "h-3.5 w-3.5"} text-white stroke-[3]`} />
            )}
          </button>
        )}
        {useThumbChrome ? (
          <>
            <div
              className={`relative w-full shrink-0 overflow-hidden ${aspectClass} rounded-xl bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200/85 dark:from-neutral-800 dark:via-neutral-800 dark:to-neutral-950/90`}
            >
                <div className="relative flex min-h-[5rem] flex-col items-center justify-center gap-0.5 px-3 py-6 max-sm:min-h-[4.5rem] max-sm:py-4">
                <div className="relative">
                  <div
                    className={`flex items-center justify-center rounded-2xl ${iconBoxClass} bg-bizzi-blue/12 text-bizzi-blue shadow-sm dark:bg-bizzi-blue/25 dark:text-bizzi-cyan`}
                  >
                    {item.customIcon ? (
                      <item.customIcon className={iconInnerClass} />
                    ) : item.name === "Storage" || item.name === "Uploads" ? (
                      <Cloud className={iconInnerClass} />
                    ) : (
                      <Folder className={iconInnerClass} />
                    )}
                  </div>
                  {item.isShared && (
                    <div className="absolute -right-1 -top-1 rounded-full bg-bizzi-blue p-1 shadow dark:bg-bizzi-cyan">
                      <Share2 className="h-3 w-3 text-white dark:text-neutral-950" />
                    </div>
                  )}
                </div>
                <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-800 dark:text-neutral-100">
                  {item.items}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                  {item.items === 1 ? "item" : "items"}
                </p>
              </div>
              {showCardInfo ? (
                <>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/85 via-black/35 to-transparent pt-12"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] space-y-0.5 px-3 pb-2.5 pt-2">
                    <p
                      className="truncate text-left text-sm font-medium text-white drop-shadow-md"
                      title={item.name}
                    >
                      {item.name}
                    </p>
                    <p className="truncate text-left text-[11px] text-white/90 drop-shadow" title={itemCountLine}>
                      {itemCountLine}
                    </p>
                  </div>
                </>
              ) : (
                <div className="absolute inset-x-0 bottom-0 z-[2] px-3 pb-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  <p className="truncate text-center text-xs font-medium text-neutral-800 drop-shadow-sm dark:text-white">
                    {item.name}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div
              className={`flex w-full flex-col items-center justify-center ${
                isSystemFolder ? "max-sm:flex-row max-sm:items-center max-sm:gap-3 max-sm:text-left" : ""
              }`}
            >
              <div
                className={`relative ${layoutSize === "small" ? "mb-2" : "mb-3"} ${
                  isSystemFolder ? "max-sm:mb-0 max-sm:shrink-0" : ""
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-xl ${iconBoxClass} ${
                    isSystemFolder
                      ? "bg-white/20 text-white shadow-none dark:bg-white/92 dark:text-neutral-900 dark:shadow-[0_1px_3px_rgba(0,0,0,0.22)]"
                      : "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                  }`}
                >
                  {item.customIcon ? (
                    <item.customIcon className={iconInnerClass} />
                  ) : item.name === "Storage" || item.name === "Uploads" ? (
                    <Cloud className={iconInnerClass} />
                  ) : (
                    <Folder className={iconInnerClass} />
                  )}
                </div>
                {item.isShared && (
                  <div className="absolute -right-1 -top-1 rounded-full bg-bizzi-blue p-1">
                    <Share2 className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              <div
                className={`min-w-0 flex-1 ${
                  isSystemFolder ? "max-sm:text-left sm:text-center" : "text-center"
                }`}
              >
                <h3
                  className={`mb-1 w-full truncate text-center font-medium ${sizeClasses.text} ${
                    isSystemFolder
                      ? "text-white max-sm:text-left max-sm:text-base dark:text-white sm:text-center"
                      : "text-neutral-900 dark:text-white"
                  }`}
                >
                  {item.name}
                </h3>
                {showCardInfo && (
                  <p
                    className={`${
                      isSystemFolder
                        ? "text-xs font-semibold text-white max-sm:text-sm dark:text-white"
                        : "text-xs text-neutral-500 dark:text-neutral-400"
                    }`}
                  >
                    {itemCountLine}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
        <div
          className={`absolute right-2 top-2 z-30 flex items-center gap-0.5 transition-opacity max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${useThumbChrome ? "rounded-md bg-black/35 p-0.5 backdrop-blur-sm sm:group-hover:bg-black/50" : isSystemFolder ? "max-sm:rounded-md max-sm:bg-black/15 max-sm:p-0.5 max-sm:backdrop-blur-sm" : ""}`}
        >
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
          {(onDelete ||
            (!item.hideShare && item.driveId) ||
            allowV2FolderMutations) && (
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
                ...(allowV2FolderMutations && item.storageFolderId
                  ? [
                      {
                        id: "v2-rename",
                        label: "Rename folder",
                        icon: <Pencil className="h-4 w-4" />,
                        onClick: () => setRenameOpen(true),
                      },
                      {
                        id: "v2-move",
                        label: "Move folder",
                        icon: <FolderInput className="h-4 w-4" />,
                        onClick: () => setV2StoragePickerOpen(true),
                      },
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
              triggerOnDark={isSystemFolder}
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
            open={renameOpen && !item.storageFolderId}
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
      {allowV2FolderMutations &&
        item.storageFolderId &&
        item.storageLinkedDriveId &&
        item.storageFolderVersion != null && (
          <>
            <RenameModal
              open={renameOpen}
              onClose={() => setRenameOpen(false)}
              currentName={item.name}
              onRename={async (newName) => {
                await renameStorageFolder(
                  item.storageFolderId!,
                  newName,
                  item.storageFolderVersion!
                );
                onStorageFolderMutated?.();
              }}
              itemType="folder"
            />
            <StorageFolderTreePickerModal
              open={v2StoragePickerOpen}
              onClose={() => setV2StoragePickerOpen(false)}
              linkedDriveId={item.storageLinkedDriveId}
              driveLabel={storagePickerDriveLabel ?? "Storage"}
              title={`Move “${item.name}” into…`}
              excludedFolderIds={[item.storageFolderId]}
              onConfirm={async (targetParentFolderId) => {
                await moveStorageFolder(
                  item.storageFolderId!,
                  targetParentFolderId,
                  item.storageFolderVersion!
                );
                onStorageFolderMutated?.();
              }}
            />
          </>
        )}
    </>
  );
}
