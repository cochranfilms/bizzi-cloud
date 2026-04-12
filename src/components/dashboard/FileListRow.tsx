"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Archive, Check, Download, FileIcon, Film, FolderInput, Info } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import type { DisplayContext } from "@/lib/metadata-display";
import { buildDisplayMetadata, classifyFileKind } from "@/lib/metadata-display";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { useBackupVideoStreamUrl } from "@/hooks/useVideoStreamUrl";
import VideoScrubThumbnail from "./VideoScrubThumbnail";
import ItemActionsMenu from "./ItemActionsMenu";
import ShareModal from "./ShareModal";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";
import { useConfirm } from "@/hooks/useConfirm";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { linkedDrivesEligibleAsMoveDestination } from "@/lib/drive-powerup-filter";
import { isLinkedDriveFolderModelV2 } from "@/lib/linked-drive-folder-model";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { isImageThumbnailTarget } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
import { isProjectFile } from "@/lib/bizzi-file-types";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";
import {
  recentFileToCreativeThumbnailSource,
  resolveCreativeProjectTile,
} from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";

function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

interface FileListRowProps {
  file: RecentFile;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  onAfterRename?: () => void;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLTableRowElement>;
  /** macOS package (.fcpbundle) row: download full ZIP restore */
  onDownloadPackage?: () => void;
  onPackageInfo?: () => void;
  /** Workspace / route hints for Location column */
  displayContext?: DisplayContext;
  /** Projects list: hide resolution, duration, codec columns */
  columnMode?: "full" | "projects";
  rowBadge?: string;
}

export default function FileListRow({
  file,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  onAfterRename,
  draggable = false,
  onDragStart,
  onDownloadPackage,
  onPackageInfo,
  displayContext,
  columnMode = "full",
  rowBadge,
}: FileListRowProps) {
  const display = useMemo(
    () => buildDisplayMetadata(file, displayContext),
    [file, displayContext]
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const blockPreviewFromShell =
    renameOpen || shareOpen || moveOpen || createFolderOpen;
  const { renameFile, moveFile, moveFilesToStorageFolder } = useCloudFiles({
    subscribeDriveListing: false,
  });
  const { createFolder, linkedDrives } = useBackup();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const moveDestinationDrives = useMemo(
    () => linkedDrivesEligibleAsMoveDestination(linkedDrives, { hasEditor, hasGallerySuite }),
    [linkedDrives, hasEditor, hasGallerySuite]
  );
  const storageV2IntraMove = useMemo(() => {
    const d = linkedDrives.find((x) => x.id === file.driveId);
    if (!d || !isLinkedDriveFolderModelV2(d)) return null;
    const base = d.name.replace(/^\[Team\]\s+/, "");
    if (base !== "Storage" || d.is_creator_raw === true) return null;
    return {
      linkedDriveId: file.driveId!,
      driveLabel: base,
      currentParentFolderId: (file.folder_id ?? null) as string | null,
    };
  }, [linkedDrives, file.driveId, file.folder_id]);
  const { isPinned, pinItem, unpinItem } = usePinned();
  const isMacosPackage = file.assetType === "macos_package" || file.id.startsWith("macos-pkg:");
  const filePinned = isPinned("file", file.id);
  const canPreview = isMacosPackage ? !!(onPackageInfo ?? onClick) : !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: !isMacosPackage,
    contentType: file.contentType,
  });
  const isVideo =
    !isMacosPackage &&
    !isAppleDoubleLeafName(file.name) &&
    (shouldUseVideoThumbnailPipeline(file.name) ||
      (file.contentType?.startsWith("video/") ?? false) ||
      file.mediaType === "video");
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isVideo,
    isVideo,
    posterRev: file.videoThumbnailRev ?? 0,
  });
  const fetchVideoStreamUrl = useBackupVideoStreamUrl();
  const isImage = isImageThumbnailTarget(file.name, file.objectKey, file.contentType);
  const isPdf = isPdfFile(file.name) || file.contentType === "application/pdf";
  const isProject =
    file.assetType === "project_file" ||
    isProjectFile(file.name) ||
    classifyFileKind(file) === "project";
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isPdf,
  });
  const hasThumbnail = isVideo || isImage || isPdf;
  const { confirm } = useConfirm();
  const creativeThumb = resolveCreativeProjectTile(recentFileToCreativeThumbnailSource(file));

  const handleDelete = async () => {
    const ok = await confirm({
      message: `Move "${file.name}" to trash? You can restore it from the Deleted files tab.`,
      destructive: true,
      confirmLabel: "Move to trash",
    });
    if (ok) onDelete?.();
  };

  return (
    <>
      <tr
        data-selectable-item
        data-item-type={isMacosPackage ? "macos-package" : "file"}
        data-item-id={file.id}
        draggable={draggable && !isMacosPackage}
        onDragStart={onDragStart}
        role={canPreview && !blockPreviewFromShell ? "button" : undefined}
        tabIndex={canPreview && !blockPreviewFromShell ? 0 : undefined}
        onClick={canPreview && !blockPreviewFromShell ? (onPackageInfo ?? onClick) : undefined}
        onKeyDown={
          canPreview && !blockPreviewFromShell
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (onPackageInfo ?? onClick)?.();
                }
              }
            : undefined
        }
        className={`border-b border-neutral-100 transition-colors last:border-0 ${
          canPreview && !blockPreviewFromShell
            ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
            : ""
        } ${selected ? "bg-bizzi-blue/5 dark:bg-bizzi-blue/10" : ""} ${
          draggable && !isMacosPackage ? "cursor-grab active:cursor-grabbing" : ""
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
            <div className="relative flex h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
              {isMacosPackage ? (
                creativeThumb.mode === "branded_project" ? (
                  <BrandedProjectTile
                    brandId={creativeThumb.brandId}
                    tileVariant={creativeThumb.tileVariant}
                    fileName={file.name}
                    displayLabel={creativeThumb.displayLabel}
                    extensionLabel={creativeThumb.extensionLabel}
                    size="sm"
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-amber-50 dark:bg-amber-950/40">
                    <Archive className="h-5 w-5 text-amber-800 dark:text-amber-400" />
                  </div>
                )
              ) : isVideo && file.objectKey ? (
                <VideoScrubThumbnail
                  fetchStreamUrl={() => fetchVideoStreamUrl(file.objectKey)}
                  thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
                  showPlayIcon={false}
                  className="h-full w-full"
                />
              ) : (thumbnailUrl || videoThumbnailUrl || pdfThumbnailUrl) ? (
                <Image
                  src={videoThumbnailUrl ?? pdfThumbnailUrl ?? thumbnailUrl ?? ""}
                  alt=""
                  width={40}
                  height={40}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : creativeThumb.mode === "branded_project" ? (
                <BrandedProjectTile
                  brandId={creativeThumb.brandId}
                  tileVariant={creativeThumb.tileVariant}
                  fileName={file.name}
                  displayLabel={creativeThumb.displayLabel}
                  extensionLabel={creativeThumb.extensionLabel}
                  size="sm"
                  className="h-full w-full"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  {hasThumbnail ? (
                    <Film className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                  ) : isProject ? (
                    <FolderInput className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                  ) : (
                    <FileIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                  )}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="block truncate font-medium text-neutral-900 dark:text-white" title={file.name}>
                  {file.name}
                </span>
                {rowBadge ? (
                  <span className="shrink-0 rounded-md bg-[var(--enterprise-primary)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    {rowBadge}
                  </span>
                ) : null}
              </div>
              {isMacosPackage ? (
                <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                  {file.macosPackageFileCount != null ? `${file.macosPackageFileCount} files` : "Package"}
                  {file.macosPackageLabel ? ` · ${file.macosPackageLabel}` : ""}
                </span>
              ) : null}
            </div>
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
            {(isMacosPackage && (onDownloadPackage || onPackageInfo || onDelete)) ||
            (!isMacosPackage && (onDelete || file.driveId)) ? (
              <ItemActionsMenu
                actions={
                  isMacosPackage
                    ? [
                        ...(onDownloadPackage
                          ? [
                              {
                                id: "download-pkg",
                                label: "Download package (ZIP)",
                                icon: <Download className="h-4 w-4" />,
                                onClick: onDownloadPackage,
                              },
                            ]
                          : []),
                        ...(onPackageInfo
                          ? [
                              {
                                id: "pkg-info",
                                label: "Package info",
                                icon: <Info className="h-4 w-4" />,
                                onClick: onPackageInfo,
                              },
                            ]
                          : []),
                        ...(onDelete
                          ? [
                              {
                                id: "delete-pkg",
                                label: "Move to trash",
                                icon: null,
                                onClick: handleDelete,
                                destructive: true,
                              },
                            ]
                          : []),
                      ]
                    : [
                        ...(file.driveId
                          ? [
                              {
                                id: "share",
                                label: "Share",
                                icon: null,
                                onClick: () => setShareOpen(true),
                              },
                            ]
                          : []),
                        {
                          id: filePinned ? "unpin" : "pin",
                          label: filePinned ? "Unpin" : "Pin",
                          icon: null,
                          onClick: () => (filePinned ? unpinItem("file", file.id) : pinItem("file", file.id)),
                        },
                        {
                          id: "rename",
                          label: "Change name",
                          icon: null,
                          onClick: () => setRenameOpen(true),
                        },
                        {
                          id: "move",
                          label: "Move",
                          icon: null,
                          onClick: () => setMoveOpen(true),
                        },
                        {
                          id: "create-folder",
                          label: "Create New Folder",
                          icon: null,
                          onClick: () => setCreateFolderOpen(true),
                        },
                        ...(onDelete
                          ? [
                              {
                                id: "delete",
                                label: "Move to trash",
                                onClick: handleDelete,
                                destructive: true,
                              },
                            ]
                          : []),
                      ]
                }
                ariaLabel={isMacosPackage ? "Package actions" : "File actions"}
                alignRight
              />
            ) : null}
          </div>
        </td>
      </tr>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        folderName={file.name}
        referencedFileIds={[file.id]}
      />
      <RenameModal
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        currentName={file.name}
        onRename={async (newName) => {
          await renameFile(file.id, newName);
          onAfterRename?.();
        }}
        itemType="file"
      />
      <MoveModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        itemName={file.name}
        itemType="file"
        excludeDriveId={storageV2IntraMove ? undefined : file.driveId}
        folders={moveDestinationDrives}
        onMove={
          storageV2IntraMove
            ? undefined
            : (targetDriveId) => moveFile(file.id, targetDriveId)
        }
        v2IntraDrive={
          storageV2IntraMove
            ? {
                linkedDriveId: storageV2IntraMove.linkedDriveId,
                driveLabel: storageV2IntraMove.driveLabel,
                currentParentFolderId: storageV2IntraMove.currentParentFolderId,
                onMoveToFolder: async (targetFolderId) => {
                  await moveFilesToStorageFolder([file.id], targetFolderId);
                  onAfterRename?.();
                },
              }
            : undefined
        }
      />
      <CreateFolderModal
        open={createFolderOpen}
        onClose={() => setCreateFolderOpen(false)}
        selectedFileIds={[file.id]}
        onCreateAndMove={async (folderName) => {
          const drive = await createFolder(folderName);
          await moveFile(file.id, drive.id);
        }}
      />
    </>
  );
}
