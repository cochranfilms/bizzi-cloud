"use client";

import { useState } from "react";
import Image from "next/image";
import { Archive, Check, Download, FileIcon, Film, FolderInput, Info } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
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
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";
import { isProjectFile } from "@/lib/bizzi-file-types";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileType(file: RecentFile): string {
  const name = file.name;
  const contentType = file.contentType;
  const assetType = file.assetType;
  if (file.creativeDisplayLabel?.trim()) return file.creativeDisplayLabel.trim();
  if (assetType === "macos_package") return "macOS package";
  if (file.macosPackageLabel?.trim()) return file.macosPackageLabel.trim();
  if (assetType === "project_file" || isProjectFile(name)) return "Project file";
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (GALLERY_VIDEO_EXT.test(name.toLowerCase()) || contentType?.startsWith("video/")) return ext || "Video";
  if (GALLERY_IMAGE_EXT.test(name) || contentType?.startsWith("image/")) return ext || "Image";
  if (/\.pdf$/i.test(name) || contentType === "application/pdf") return "PDF";
  return ext || "File";
}

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatResolution(
  w: number | null | undefined,
  h: number | null | undefined,
  resolution_w?: number | null,
  resolution_h?: number | null
): string {
  const rw = resolution_w ?? w;
  const rh = resolution_h ?? h;
  if (rw != null && rh != null && rw > 0 && rh > 0) return `${rw}×${rh}`;
  return "—";
}

function isVideoFile(name: string) {
  return GALLERY_VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return GALLERY_IMAGE_EXT.test(name);
}
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
}: FileListRowProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const { renameFile, moveFile } = useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });
  const { isPinned, pinItem, unpinItem } = usePinned();
  const isMacosPackage = file.assetType === "macos_package" || file.id.startsWith("macos-pkg:");
  const filePinned = isPinned("file", file.id);
  const canPreview = isMacosPackage ? !!(onPackageInfo ?? onClick) : !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: !isMacosPackage,
  });
  const isVideo =
    !isMacosPackage &&
    !isAppleDoubleLeafName(file.name) &&
    (isVideoFile(file.name) || (file.contentType?.startsWith("video/") ?? false));
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isVideo,
    isVideo,
  });
  const fetchVideoStreamUrl = useBackupVideoStreamUrl();
  const isImage = isImageFile(file.name);
  const isPdf = isPdfFile(file.name) || file.contentType === "application/pdf";
  const isProject = file.assetType === "project_file" || isProjectFile(file.name);
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isPdf,
  });
  const hasThumbnail = isVideo || isImage || isPdf;
  const { confirm } = useConfirm();

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
        role={canPreview ? "button" : undefined}
        tabIndex={canPreview ? 0 : undefined}
        onClick={canPreview ? (onPackageInfo ?? onClick) : undefined}
        onKeyDown={
          canPreview
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  (onPackageInfo ?? onClick)?.();
                }
              }
            : undefined
        }
        className={`border-b border-neutral-100 transition-colors last:border-0 ${
          canPreview ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50" : ""
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
                <div className="flex h-full w-full items-center justify-center bg-amber-50 dark:bg-amber-950/40">
                  <Archive className="h-5 w-5 text-amber-800 dark:text-amber-400" />
                </div>
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
              <span className="block truncate font-medium text-neutral-900 dark:text-white" title={file.name}>
                {file.name}
              </span>
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
          {getFileType(file)}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {formatBytes(file.size)}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {formatDate(file.modifiedAt)}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {file.driveName}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {formatResolution(
            file.width,
            file.height,
            file.resolution_w,
            file.resolution_h
          )}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {isVideo ? formatDuration(file.duration_sec) : "—"}
        </td>
        <td className="px-4 py-2 text-sm text-neutral-600 dark:text-neutral-400">
          {file.video_codec ?? "—"}
        </td>
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
                          label: "Rename",
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
        linkedDriveId={file.driveId}
        backupFileId={file.id}
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
        excludeDriveId={file.driveId}
        folders={visibleLinkedDrives}
        onMove={(targetDriveId) => moveFile(file.id, targetDriveId)}
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
