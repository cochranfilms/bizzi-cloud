"use client";

import { useState } from "react";
import { FileIcon, Film, Play, Share2 } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import ItemActionsMenu from "./ItemActionsMenu";
import ShareModal from "./ShareModal";

interface FileCardProps {
  file: RecentFile;
  onClick?: () => void;
  onDelete?: () => void;
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

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
}

export default function FileCard({ file, onClick, onDelete }: FileCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const canPreview = !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb");
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: isInView && !!file.objectKey,
  });
  const isVideo = isVideoFile(file.name);
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
      className={`group relative flex flex-col rounded-xl border border-neutral-200 bg-white p-6 transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
        hasLargePreview ? "items-stretch" : "items-center"
      } ${
        canPreview
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
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
        folderName={file.driveName}
        linkedDriveId={file.driveId}
      />
    </div>
  );
}
