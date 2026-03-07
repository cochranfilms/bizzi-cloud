"use client";

import { useState } from "react";
import { Check, FileIcon, Film, Play, Share2, Pencil, FolderInput, FolderPlus, Pin } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { usePinned } from "@/hooks/usePinned";
import { useBackup } from "@/context/BackupContext";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import ItemActionsMenu from "./ItemActionsMenu";
import ShareModal from "./ShareModal";
import RenameModal from "./RenameModal";
import MoveModal from "./MoveModal";
import CreateFolderModal from "./CreateFolderModal";

interface FileCardProps {
  file: RecentFile;
  onClick?: () => void;
  onDelete?: () => void;
  selected?: boolean;
  onSelect?: () => void;
  selectable?: boolean;
  /** Called after a successful rename to refresh the view */
  onAfterRename?: () => void;
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

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
}

export default function FileCard({
  file,
  onClick,
  onDelete,
  selected = false,
  onSelect,
  selectable = false,
  onAfterRename,
}: FileCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const { renameFile, moveFile } = useCloudFiles();
  const { createFolder, linkedDrives } = useBackup();
  const { isPinned, pinItem, unpinItem } = usePinned();
  const filePinned = isPinned("file", file.id);
  const canPreview = !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb");
  const isVideo = isVideoFile(file.name) || (file.contentType?.startsWith("video/") ?? false);
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isVideo,
    isVideo,
  });
  const isImage = isImageFile(file.name);
  const hasLargePreview = isVideo || isImage;

  const handleDelete = () => {
    if (
      window.confirm(
        `Move "${file.name}" to trash? You can restore it from the Deleted files tab.`
      )
    ) {
      onDelete?.();
    }
  };

  return (
    <div
      ref={cardRef}
      className={`group relative flex flex-col rounded-xl border p-6 transition-colors ${
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
        className={`relative mb-3 flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${
          hasLargePreview ? "w-full min-w-0 aspect-video" : "h-16 w-16"
        }`}
      >
        {(thumbnailUrl || videoThumbnailUrl) ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API or video frame capture */}
            <img
              src={videoThumbnailUrl ?? thumbnailUrl ?? ""}
              alt=""
              className="h-full w-full object-cover"
            />
            {isVideo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
                  <Play className="ml-1 h-6 w-6 fill-white text-white" />
                </div>
              </div>
            )}
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
          <FileIcon className="h-8 w-8" />
        )}
      </div>
      <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white" title={file.name}>
        {file.name}
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {formatBytes(file.size)} · {file.driveName}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
        {formatDate(file.modifiedAt)}
      </p>

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
        folders={linkedDrives}
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
