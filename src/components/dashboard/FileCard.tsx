"use client";

import { useState } from "react";
import { Archive, Check, Download, FileIcon, Film, Info, Play, Share2, Pencil, FolderInput, FolderPlus, Pin } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import type { CardSize, AspectRatio, ThumbnailScale } from "@/context/LayoutSettingsContext";
import type { CardPresentation } from "@/lib/card-presentation";
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
import { useBackupFileLiveProxyStatus } from "@/hooks/useBackupFileLiveProxyStatus";
import type { ProxyStatus } from "@/hooks/useCloudFiles";
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
import { isProjectFile } from "@/lib/bizzi-file-types";
import { isAppleDoubleLeafName } from "@/lib/apple-double-files";
import {
  recentFileToCreativeThumbnailSource,
  resolveCreativeProjectTile,
} from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";

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
  onDownloadPackage?: () => void;
  onPackageInfo?: () => void;
  /** Final Cut library / package: open drive folder to package root (e.g. double-click in All Files). */
  onMacosPackageNavigate?: () => void;
  /** Thumbnail browse mode: media-first chrome and caption overlay */
  presentation?: CardPresentation;
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

import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
function isPdfFile(name: string) {
  return /\.pdf$/i.test(name);
}

function formatDurationThumb(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isPreviewProxyBadgeStatus(s: ProxyStatus | null | undefined): s is ProxyStatus {
  return (
    s === "pending" ||
    s === "processing" ||
    s === "ready" ||
    s === "failed" ||
    s === "raw_unsupported"
  );
}

function previewProxyBadgeContent(status: ProxyStatus): {
  label: string;
  title: string;
} | null {
  const isBusy = status === "pending" || status === "processing";
  const isReady = status === "ready";
  const isFailed = status === "failed";
  const isRaw = status === "raw_unsupported";
  if (isBusy) {
    return {
      label: "Preview Processing",
      title: "Generating a lightweight preview for faster playback",
    };
  }
  if (isReady) {
    return {
      label: "Preview Ready",
      title: "Preview is ready for playback and editing workflows",
    };
  }
  if (isFailed) {
    return {
      label: "Preview Failed",
      title: "Preview could not be generated",
    };
  }
  if (isRaw) {
    return {
      label: "Original format",
      title: "This original format uses full-quality playback only",
    };
  }
  return null;
}

function FilePreviewProxyBadge({ status }: { status: ProxyStatus }) {
  const content = previewProxyBadgeContent(status);
  if (!content) return null;
  const { label, title } = content;
  const isBusy = status === "pending" || status === "processing";
  const isReady = status === "ready";
  const isFailed = status === "failed";

  const className = isBusy
    ? "bg-amber-500/14 text-amber-900 ring-amber-500/35 dark:bg-amber-400/12 dark:text-amber-100 dark:ring-amber-400/35"
    : isReady
      ? "bg-emerald-500/14 text-emerald-900 ring-emerald-500/35 dark:bg-emerald-400/12 dark:text-emerald-100 dark:ring-emerald-400/30"
      : isFailed
        ? "bg-red-500/14 text-red-900 ring-red-500/35 dark:bg-red-400/12 dark:text-red-100 dark:ring-red-400/35"
        : "bg-neutral-500/12 text-neutral-700 ring-neutral-500/25 dark:bg-neutral-400/10 dark:text-neutral-200 dark:ring-neutral-500/30";

  return (
    <span
      className={`inline-flex shrink-0 max-w-[8.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight ring-1 ring-inset ${className}`}
      title={title}
    >
      {label}
    </span>
  );
}

/** Compact pill for dark gradient thumbnail caption (readable on video overlay). */
function FilePreviewProxyBadgeThumb({ status }: { status: ProxyStatus }) {
  const content = previewProxyBadgeContent(status);
  if (!content) return null;
  const { label, title } = content;
  const isBusy = status === "pending" || status === "processing";
  const isReady = status === "ready";
  const isFailed = status === "failed";

  const className = isBusy
    ? "bg-amber-500/55 text-white ring-white/30 shadow-sm backdrop-blur-[2px]"
    : isReady
      ? "bg-emerald-600/55 text-white ring-white/30 shadow-sm backdrop-blur-[2px]"
      : isFailed
        ? "bg-red-600/55 text-white ring-white/30 shadow-sm backdrop-blur-[2px]"
        : "bg-black/45 text-white/95 ring-white/25 shadow-sm backdrop-blur-[2px]";

  return (
    <span
      className={`inline-flex shrink-0 max-w-[8.5rem] items-center justify-center rounded-md px-1.5 py-0.5 text-center text-[10px] font-semibold leading-tight ring-1 ring-inset ${className}`}
      title={title}
    >
      {label}
    </span>
  );
}

function fileThumbCaptionSecondary(file: RecentFile, isMacosPackage: boolean): string {
  if (isMacosPackage) {
    if (file.macosPackageFileCount != null) return `${file.macosPackageFileCount} files`;
    return file.macosPackageLabel?.trim() || "Package";
  }
  const dur = formatDurationThumb(file.duration_sec);
  const rw = file.resolution_w;
  const rh = file.resolution_h;
  const res = rw != null && rh != null && rw > 0 && rh > 0 ? `${rw}×${rh}` : "";
  if (dur && res) return `${dur} · ${res}`;
  if (dur) return dur;
  if (res) return res;
  return `${formatBytes(file.size)}`;
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
  onDownloadPackage,
  onPackageInfo,
  onMacosPackageNavigate,
  presentation = "default",
}: FileCardProps) {
  const isThumb = presentation === "thumbnail";
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
  const isMacosPackage = file.assetType === "macos_package" || file.id.startsWith("macos-pkg:");
  const showHeartRow = !isMacosPackage || isProjectFile(file.name);
  const filePinned = isPinned("file", file.id);
  const canPreview = isMacosPackage ? !!(onPackageInfo ?? onClick) : !!file.objectKey;
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: !isMacosPackage && isInView,
  });
  const isVideo =
    !isMacosPackage &&
    !isAppleDoubleLeafName(file.name) &&
    (shouldUseVideoThumbnailPipeline(file.name) ||
      (file.contentType?.startsWith("video/") ?? false) ||
      file.mediaType === "video");
  const liveProxyStatus = useBackupFileLiveProxyStatus(file.id, isVideo, file.proxyStatus);
  const effectiveProxyStatus = liveProxyStatus ?? null;
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isVideo && isInView,
    isVideo,
  });
  const fetchVideoStreamUrl = useBackupVideoStreamUrl();
  const isPdf = isPdfFile(file.name) || file.contentType === "application/pdf";
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !isMacosPackage && !!file.objectKey && isPdf && isInView,
  });
  const { confirm } = useConfirm();
  const hearts = useHearts(file.id);
  const sizeClasses = FILE_SIZE_CLASSES[layoutSize];
  const aspectClass = getCardAspectClass(layoutAspectRatio);
  const objectFit = thumbnailScale === "fill" ? "object-cover" : "object-contain";
  // Videos respect thumbnailScale like images: Fill = object-cover (Frame.io style, no black bars), Fit = object-contain.
  const videoObjectFit = thumbnailScale === "fill" ? "object-cover" : "object-contain";

  const creativeThumb = resolveCreativeProjectTile(recentFileToCreativeThumbnailSource(file));
  const brandedTileSize =
    layoutSize === "small" ? "sm" : layoutSize === "medium" ? "md" : "lg";

  const handleDelete = async () => {
    const ok = await confirm({
      message: `Move "${file.name}" to trash? You can restore it from the Deleted files tab.`,
      destructive: true,
      confirmLabel: "Move to trash",
    });
    if (ok) onDelete?.();
  };

  const sizeLine = `${formatBytes(file.size)} · ${file.driveName}${file.creativeDisplayLabel ? ` · ${file.creativeDisplayLabel}` : ""}`;
  const captionSecondary = fileThumbCaptionSecondary(file, isMacosPackage);

  const rootShell = isThumb
    ? `group touch-manipulation relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl transition-all ${
        selected
          ? "ring-2 ring-bizzi-blue ring-offset-2 ring-offset-white shadow-md shadow-bizzi-blue/20 dark:ring-bizzi-cyan dark:ring-offset-neutral-950 dark:shadow-bizzi-cyan/25"
          : "ring-1 ring-neutral-200/80 bg-neutral-100/45 dark:ring-neutral-700/55 dark:bg-neutral-900/40"
      } ${
        canPreview && !selected
          ? "cursor-pointer hover:ring-neutral-300 hover:shadow-sm dark:hover:ring-neutral-600"
          : canPreview && selected
            ? "cursor-pointer"
            : ""
      }`
    : `group touch-manipulation relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-xl border transition-colors ${
        selected
          ? "border-bizzi-blue ring-2 ring-bizzi-blue/50 bg-bizzi-blue/5 dark:border-bizzi-blue dark:bg-bizzi-blue/10"
          : "border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
      } ${
        canPreview && !selected
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : canPreview && selected
            ? "cursor-pointer"
            : ""
      }`;

  return (
    <div
      ref={cardRef}
      title={!showCardInfo ? file.name : undefined}
      className={rootShell}
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      aria-label={canPreview && isThumb && !showCardInfo ? file.name : undefined}
      onClick={canPreview ? (onPackageInfo ?? onClick) : undefined}
      onDoubleClick={
        isMacosPackage && onMacosPackageNavigate
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onMacosPackageNavigate();
            }
          : undefined
      }
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
    >
      {selectable && onSelect && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className={`absolute left-2 top-2 z-20 flex items-center justify-center rounded-md border-2 transition-colors ${
            isThumb
              ? "h-5 w-5 border-white/60 bg-black/40 backdrop-blur-sm hover:bg-black/55 dark:border-white/50"
              : "h-6 w-6 hover:bg-neutral-100 dark:hover:bg-neutral-700"
          } ${
            selected
              ? "border-bizzi-blue bg-bizzi-blue dark:border-bizzi-blue dark:bg-bizzi-blue"
              : isThumb
                ? "border-white/60 bg-black/35"
                : "border-neutral-300 bg-transparent dark:border-neutral-600"
          }`}
          aria-label={selected ? "Deselect" : "Select"}
          aria-pressed={selected}
        >
          {selected && (
            <Check className={`${isThumb ? "h-3 w-3" : "h-3.5 w-3.5"} text-white stroke-[3]`} />
          )}
        </button>
      )}
      {((isMacosPackage && (onDownloadPackage || onPackageInfo || onDelete)) ||
        (!isMacosPackage && (onDelete || file.driveId))) && (
        <div
          className={`absolute right-2 top-2 z-20 transition-opacity max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 ${isThumb ? "rounded-md bg-black/35 p-0.5 backdrop-blur-sm sm:group-hover:bg-black/50" : "max-sm:rounded-md max-sm:bg-neutral-100/90 max-sm:p-0.5 max-sm:dark:bg-neutral-800/90"}`}
        >
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
                  ]
            }
            ariaLabel={isMacosPackage ? "Package actions" : "File actions"}
            alignRight
          />
        </div>
      )}
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${aspectClass}`}
      >
        {isMacosPackage ? (
          creativeThumb.mode === "branded_project" ? (
            <BrandedProjectTile
              brandId={creativeThumb.brandId}
              tileVariant={creativeThumb.tileVariant}
              fileName={file.name}
              displayLabel={creativeThumb.displayLabel}
              extensionLabel={creativeThumb.extensionLabel}
              size={brandedTileSize}
              className="absolute inset-0"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-amber-50 dark:bg-amber-950/40">
              <Archive className={`${sizeClasses.iconInner} text-amber-800 dark:text-amber-400`} />
            </div>
          )
        ) : isVideo && file.objectKey ? (
          <VideoScrubThumbnail
            fetchStreamUrl={() => fetchVideoStreamUrl(file.objectKey)}
            thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
            showPlayIcon
            objectFit={videoObjectFit}
            className="absolute inset-0 h-full min-h-0 w-full"
          />
        ) : thumbnailUrl || videoThumbnailUrl || pdfThumbnailUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API, video frame, or PDF first page */}
            <img
              src={videoThumbnailUrl ?? pdfThumbnailUrl ?? thumbnailUrl ?? ""}
              alt=""
              className={`absolute inset-0 h-full w-full ${objectFit}`}
            />
          </>
        ) : isVideo ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="absolute inset-2 max-h-full max-w-full text-neutral-500 dark:text-neutral-400" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 shadow-lg">
                <Play className="ml-1 h-6 w-6 fill-white text-white" />
              </div>
            </div>
          </div>
        ) : creativeThumb.mode === "branded_project" ? (
          <BrandedProjectTile
            brandId={creativeThumb.brandId}
            tileVariant={creativeThumb.tileVariant}
            fileName={file.name}
            displayLabel={creativeThumb.displayLabel}
            extensionLabel={creativeThumb.extensionLabel}
            size={brandedTileSize}
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <FileIcon className={sizeClasses.iconInner} />
          </div>
        )}
        {isThumb && showCardInfo ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-14 pb-0"
              aria-hidden
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] space-y-0.5 px-3 pb-2.5 pt-2">
              {!isMacosPackage && isVideo && isPreviewProxyBadgeStatus(effectiveProxyStatus) ? (
                <div className="mb-0.5 flex justify-end">
                  <FilePreviewProxyBadgeThumb status={effectiveProxyStatus} />
                </div>
              ) : null}
              <p
                className="truncate text-left text-sm font-medium text-white drop-shadow-md"
                title={file.name}
              >
                {file.name}
              </p>
              <p
                className="truncate text-left text-[11px] text-white/90 drop-shadow"
                title={captionSecondary}
              >
                {captionSecondary}
              </p>
            </div>
          </>
        ) : null}
        {isThumb && !showCardInfo ? (
          <div className="absolute inset-x-0 bottom-0 z-[2] px-3 pb-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <p className="truncate text-left text-xs font-medium text-white drop-shadow-md">{file.name}</p>
          </div>
        ) : null}
        {isThumb && showHeartRow ? (
          <div
            className={`absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/45 p-1 shadow-sm backdrop-blur-sm dark:bg-black/55 ${!showCardInfo ? "opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100" : ""}`}
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
        ) : null}
      </div>
      {!isThumb && showCardInfo && (
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${sizeClasses.padding} pt-2`}
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <h3
                className={`mb-1 w-full truncate text-left font-medium text-neutral-900 dark:text-white ${sizeClasses.text}`}
                title={file.name}
              >
                {file.name}
              </h3>
              <p
                className="truncate text-left text-xs text-neutral-500 dark:text-neutral-400"
                title={sizeLine}
              >
                {sizeLine}
              </p>
              {/* Fixed slot so macOS package rows don’t shift the date / heart row vs other cards */}
              <div className="mt-0.5 min-h-[1.375rem] shrink-0">
                {isMacosPackage ? (
                  <p className="text-left text-xs text-neutral-500 dark:text-neutral-400">
                    {file.macosPackageFileCount != null ? `${file.macosPackageFileCount} files` : "Package"}
                    {file.macosPackageLabel ? ` · ${file.macosPackageLabel}` : ""}
                  </p>
                ) : null}
              </div>
              <p className="mt-0.5 shrink-0 text-left text-xs text-neutral-400 dark:text-neutral-500">
                {formatDate(file.modifiedAt)}
              </p>
            </div>
            {!isMacosPackage && isVideo && isPreviewProxyBadgeStatus(effectiveProxyStatus) ? (
              <div className="shrink-0 pt-0.5">
                <FilePreviewProxyBadge status={effectiveProxyStatus} />
              </div>
            ) : null}
          </div>
          {showHeartRow ? (
            <div
              className="mt-auto flex w-full justify-center pt-2"
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
          ) : null}
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
