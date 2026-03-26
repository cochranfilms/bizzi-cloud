"use client";

import { useState } from "react";
import { Check, FileIcon, Film, Play, Share2, Pencil, FolderInput, FolderPlus, Pin } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import type { CardSize, AspectRatio, ThumbnailScale } from "@/context/LayoutSettingsContext";
import { getCardAspectClass } from "@/lib/card-aspect-utils";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { filterLinkedDrivesByPowerUp } from "@/lib/drive-powerup-filter";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { useBackupVideoStreamUrl } from "@/hooks/useVideoStreamUrl";
import { useInView } from "@/hooks/useInView";
import VideoScrubThumbnail from "./VideoScrubThumbnail";
import ItemActionsMenu from "./ItemActionsMenu";
import ShareModal from "./ShareModal";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";
import { useConfirm } from "@/hooks/useConfirm";
import HeartButton from "@/components/collaboration/HeartButton";
import { useHearts } from "@/hooks/useHearts";

interface FileCardProps {
  file: RecentFile;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  /** Called after a successful rename to refresh the view */
  onAfterRename?: () => void;
  /** Layout: card size (small/medium/large) */
  layoutSize?: CardSize;
  /** Layout: aspect ratio of the thumbnail area */
  layoutAspectRatio?: AspectRatio;
  /** Layout: how thumbnail fills the area (fit = show full, fill = crop to fill) */
  thumbnailScale?: ThumbnailScale;
  /** Layout: whether to show metadata (filename, size, date, etc.) */
  showCardInfo?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 24 * 60 * 60 * 1000) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString();
}

import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";

function isVideoFile(name: string) {
  return GALLERY_VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return GALLERY_IMAGE_EXT.test(name);
}
function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

// Scaled so largest never exceeds former medium; large = former medium
const FILE_SIZE_CLASSES = {
  small: { padding: "p-3", icon: "h-8 w-8", iconInner: "h-4 w-4", text: "text-xs" },
  medium: { padding: "p-4", icon: "h-10 w-10", iconInner: "h-5 w-5", text: "text-xs" },
  large: { padding: "p-6", icon: "h-16 w-16", iconInner: "h-8 w-8", text: "text-sm" },
} as const;

export default function FileCard({
  file,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  onAfterRename,
  layoutSize = "medium",
  layoutAspectRatio = "landscape",
  thumbnailScale = "fit",
  showCardInfo = true,
}: FileCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const { renameFile, moveFile } = useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const visibleLinkedDrives = filterLinkedDrivesByPowerUp(linkedDrives, {
    hasEditor,
    hasGallerySuite,
  });
  const { isPinned, pinItem, unpinItem } = usePinned();
  const filePinned = isPinned("file", file.id);
  const canPreview = !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: isInView,
  });
  const isVideo = isVideoFile(file.name) || (file.contentType?.startsWith("video/") ?? false);
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isVideo && isInView,
    isVideo,
  });
  const fetchVideoStreamUrl = useBackupVideoStreamUrl();
  const isImage = isImageFile(file.name);
  const isPdf = isPdfFile(file.name) || file.contentType === "application/pdf";
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isPdf && isInView,
  });
  const hasLargePreview = isVideo || isImage || isPdf;
  const { confirm } = useConfirm();
  const hearts = useHearts(file.id);
  const sizeClasses = FILE_SIZE_CLASSES[layoutSize];
  const aspectClass = getCardAspectClass(layoutAspectRatio);
  const objectFit = thumbnailScale === "fill" ? "object-cover" : "object-contain";
  // Videos respect thumbnailScale like images: Fill = object-cover (Frame.io style, no black bars), Fit = object-contain.
  const videoObjectFit = thumbnailScale === "fill" ? "object-cover" : "object-contain";

  const handleDelete = async () => {
    const ok = await confirm({
      message: `Move "${file.name}" to trash? You can restore it from the Deleted files tab.`,
      destructive: true,
      confirmLabel: "Move to trash",
    });
    if (ok) onDelete?.();
  };

  return (
    <div
      ref={cardRef}
      title={!showCardInfo ? file.name : undefined}
      className={`group relative flex min-w-0 flex-col overflow-hidden rounded-xl border transition-colors ${aspectClass} ${sizeClasses.padding} ${
        hasLargePreview ? "items-stretch" : "items-center"
      } ${
        selected
          ? "border-bizzi-blue ring-2 ring-bizzi-blue/50 bg-bizzi-blue/5 dark:border-bizzi-blue dark:bg-bizzi-blue/10"
          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${
        canPreview && !selected
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : canPreview && selected
            ? "cursor-pointer"
            : ""
      }`}
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onClick={canPreview ? onClick : undefined}
      onKeyDown={
        canPreview
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
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
      {(onDelete || file.driveId) && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <ItemActionsMenu
            actions={[
              ...(file.driveId
                ? [
                    {
                      id: "share",
                      label: "Share",
                      icon: <Share2 className="h-4 w-4" />,
                      onClick: () => setShareOpen(true),
                    },
                  ]
                : []),
              {
                id: filePinned ? "unpin" : "pin",
                label: filePinned ? "Unpin" : "Pin",
                icon: <Pin className="h-4 w-4" />,
                onClick: () => (filePinned ? unpinItem("file", file.id) : pinItem("file", file.id)),
              },
              {
                id: "rename",
                label: "Rename",
                icon: <Pencil className="h-4 w-4" />,
                onClick: () => setRenameOpen(true),
              },
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
            ]}
            ariaLabel="File actions"
            alignRight
          />
        </div>
      )}
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${
          hasLargePreview ? "mb-2 w-full min-w-0 min-h-0 flex-1" : "shrink-0 " + sizeClasses.icon
        }`}
      >
        {isVideo && file.objectKey ? (
          <VideoScrubThumbnail
            fetchStreamUrl={() => fetchVideoStreamUrl(file.objectKey)}
            thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
            showPlayIcon
            objectFit={videoObjectFit}
          />
        ) : (thumbnailUrl || videoThumbnailUrl || pdfThumbnailUrl) ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API, video frame, or PDF first page */}
            <img
              src={videoThumbnailUrl ?? pdfThumbnailUrl ?? thumbnailUrl ?? ""}
              alt=""
              className={`h-full w-full ${objectFit}`}
            />
          </>
        ) : isVideo ? (
          <div className="relative flex h-full w-full items-center justify-center">
            <Film className="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] text-neutral-500 dark:text-neutral-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
                <Play className="ml-1 h-6 w-6 fill-white text-white" />
              </div>
            </div>
          </div>
        ) : (
          <FileIcon className={sizeClasses.iconInner} />
        )}
      </div>
      {showCardInfo && (
        <div className="shrink-0 min-w-0">
          <h3 className={`mb-1 truncate w-full text-center font-medium text-neutral-900 dark:text-white ${sizeClasses.text}`} title={file.name}>
            {file.name}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {formatBytes(file.size)} · {file.driveName}
          </p>
          <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
            {formatDate(file.modifiedAt)}
          </p>
          {isVideo && file.proxyStatus && (
            <p
              className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400"
              title={
                file.proxyStatus === "ready"
                  ? "Proxy ready for editing"
                  : file.proxyStatus === "pending" || file.proxyStatus === "processing"
                    ? "Proxy generating..."
                    : file.proxyStatus === "failed"
                      ? "Proxy failed"
                      : file.proxyStatus === "raw_unsupported"
                        ? "RAW original only"
                        : ""
              }
            >
              {file.proxyStatus === "ready"
                ? "Proxy ready"
                : file.proxyStatus === "pending" || file.proxyStatus === "processing"
                  ? "Proxy processing"
                  : file.proxyStatus === "failed"
                    ? "Proxy failed"
                    : file.proxyStatus === "raw_unsupported"
                      ? "RAW only"
                      : null}
            </p>
          )}
          <div
            className="mt-2 flex justify-center"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <HeartButton
              count={hearts.count}
              hasHearted={hearts.hasHearted}
              loading={hearts.loading}
              onToggle={hearts.toggle}
              size="sm"
              showCount
            />
          </div>
        </div>
      )}

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
    </div>
  );
}
