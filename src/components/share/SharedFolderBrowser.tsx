"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, File } from "lucide-react";
import FolderCard, { type FolderItem } from "@/components/dashboard/FolderCard";
import { useLayoutSettingsOptional } from "@/context/LayoutSettingsContext";
import { getCardAspectClass } from "@/lib/card-aspect-utils";
import type { CardPresentation } from "@/lib/card-presentation";
import { listShareFolderChildren } from "@/lib/share-folder-tree";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import { useShareVideoThumbnail } from "@/hooks/useShareVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";
import SharePreviewModal, { type ShareFile } from "./SharePreviewModal";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const FILE_GRID_SIZE_CLASSES = {
  small: { text: "text-xs", capPad: "px-2 py-1.5" },
  medium: { text: "text-xs", capPad: "px-2.5 py-2" },
  large: { text: "text-sm", capPad: "px-3 py-2" },
} as const;

function ShareFileGridCard({
  shareToken,
  file,
  getAuthToken,
  layoutSize,
  layoutAspectRatio,
  thumbnailScale,
  presentation,
  showCardInfo,
  onPreview,
  onDownload,
  downloadingId,
  canDownload,
}: {
  shareToken: string;
  file: ShareFile;
  getAuthToken?: () => Promise<string | null>;
  layoutSize: keyof typeof FILE_GRID_SIZE_CLASSES;
  layoutAspectRatio: "landscape" | "square" | "portrait";
  thumbnailScale: "fit" | "fill";
  presentation: CardPresentation;
  showCardInfo: boolean;
  onPreview: (file: ShareFile) => void;
  onDownload: (file: ShareFile) => void;
  downloadingId: string | null;
  canDownload: boolean;
}) {
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const thumbnailUrl = useShareThumbnail(shareToken, file.object_key, file.name, {
    size: "thumb",
    enabled: isInView,
    getAuthToken,
  });
  const videoThumbnailUrl = useShareVideoThumbnail(shareToken, file.object_key, file.name, {
    enabled: isInView,
    getAuthToken,
  });
  const isVideo = isVideoFile(file.name);
  const canPreview = !!file.object_key;
  const shareCreative = resolveCreativeProjectTile({
    name: file.name,
    path: file.path || file.name,
  });
  const isThumb = presentation === "thumbnail";
  const aspectClass = getCardAspectClass(layoutAspectRatio);
  const objectFit = thumbnailScale === "fill" ? "object-cover" : "object-contain";
  const videoObjectFit = objectFit as "object-cover" | "object-contain";
  const sizeTok = FILE_GRID_SIZE_CLASSES[layoutSize];

  const fetchShareVideoStreamUrl = useCallback(async (): Promise<string | null> => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (getAuthToken) {
        const t = await getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(`/api/shares/${encodeURIComponent(shareToken)}/video-stream-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ object_key: file.object_key }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { streamUrl?: string };
      const url = data?.streamUrl;
      if (!url) return null;
      return url.startsWith("/") ? `${window.location.origin}${url}` : url;
    } catch {
      return null;
    }
  }, [shareToken, file.object_key, getAuthToken]);

  const shell = isThumb
    ? `group touch-manipulation relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-2xl transition-all ring-1 ring-inset ring-neutral-200/80 bg-neutral-100/45 dark:ring-neutral-700/55 dark:bg-neutral-900/40 ${
        canPreview ? "cursor-pointer hover:ring-neutral-300 hover:shadow-sm dark:hover:ring-neutral-600" : ""
      }`
    : `group touch-manipulation relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
        canPreview
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : ""
      }`;

  return (
    <div
      ref={cardRef}
      className={`h-full min-h-0 ${shell}`}
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onClick={canPreview ? () => onPreview(file) : undefined}
      onKeyDown={
        canPreview
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onPreview(file);
              }
            }
          : undefined
      }
    >
      <div
        className={`relative w-full shrink-0 overflow-hidden bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400 ${aspectClass}`}
      >
        {isVideo ? (
          <VideoScrubThumbnail
            fetchStreamUrl={fetchShareVideoStreamUrl}
            thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
            showPlayIcon
            objectFit={videoObjectFit}
            className="absolute inset-0 h-full min-h-0 w-full"
          />
        ) : (thumbnailUrl || videoThumbnailUrl) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl ?? ""} alt="" className={`absolute inset-0 h-full w-full ${objectFit}`} />
        ) : shareCreative.mode === "branded_project" ? (
          <BrandedProjectTile
            brandId={shareCreative.brandId}
            tileVariant={shareCreative.tileVariant}
            fileName={file.name}
            displayLabel={shareCreative.displayLabel}
            extensionLabel={shareCreative.extensionLabel}
            size="md"
            className="absolute inset-0"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800">
            <File className="h-12 w-12 text-neutral-500 dark:text-neutral-400" />
          </div>
        )}
        {canDownload && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDownload(file);
            }}
            disabled={downloadingId === file.id}
            className={`absolute bottom-2 right-2 z-10 flex items-center justify-center rounded-lg border border-neutral-200/90 bg-white/95 p-2 text-neutral-700 shadow-sm backdrop-blur-sm transition-colors hover:border-bizzi-blue hover:text-bizzi-blue disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900/90 dark:text-neutral-200 dark:hover:border-bizzi-cyan dark:hover:text-bizzi-cyan ${
              isThumb ? "opacity-90 sm:opacity-0 sm:group-hover:opacity-100" : "opacity-95 sm:opacity-0 sm:group-hover:opacity-100"
            }`}
            aria-label="Download"
          >
            <Download className="h-4 w-4" />
          </button>
        )}
      </div>
      {showCardInfo ? (
        <div
          className={`${sizeTok.capPad} border-t border-neutral-200/80 dark:border-neutral-700/80 ${
            isThumb
              ? "bg-gradient-to-t from-black/55 to-transparent dark:from-black/50"
              : ""
          }`}
        >
          <p
            className={`truncate font-medium ${sizeTok.text} ${
              isThumb ? "text-white drop-shadow" : "text-neutral-900 dark:text-white"
            }`}
            title={file.name}
          >
            {file.name}
          </p>
          <p
            className={`truncate ${sizeTok.text} ${
              isThumb ? "text-white/85" : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {formatSize(file.size_bytes)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function subfolderKey(prefix: string[], name: string): string {
  return [...prefix, name].join("\0");
}

export interface SharedFolderBrowserProps {
  shareToken: string;
  /** Display name for the root of this share (shared folder title). */
  rootLabel: string;
  files: ShareFile[];
  getAuthToken?: () => Promise<string | null>;
  canDownload: boolean;
  onDownload: (file: ShareFile) => void;
  downloadingId: string | null;
  /** Framed panel (dashboard); flatter block on public /s page. */
  chrome?: "dashboard" | "standalone";
}

export default function SharedFolderBrowser({
  shareToken,
  rootLabel,
  files,
  getAuthToken,
  canDownload,
  onDownload,
  downloadingId,
  chrome = "dashboard",
}: SharedFolderBrowserProps) {
  const layout = useLayoutSettingsOptional();
  /** List layout reads like a long menu of files; match sender Storage (card grid) for shares. */
  const viewMode = layout.viewMode === "list" ? "grid" : layout.viewMode;
  const { cardSize, aspectRatio, thumbnailScale, showCardInfo } = layout;
  const [pathPrefix, setPathPrefix] = useState<string[]>([]);
  const [previewFile, setPreviewFile] = useState<ShareFile | null>(null);

  useEffect(() => {
    setPathPrefix([]);
  }, [shareToken, files]);

  const { subfolders, filesHere } = useMemo(
    () => listShareFolderChildren(files, pathPrefix),
    [files, pathPrefix]
  );

  const gridGapClass = viewMode === "thumbnail" ? "gap-3" : "gap-4";
  const gridCols =
    viewMode === "thumbnail"
      ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : cardSize === "small"
        ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
        : cardSize === "large"
          ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
          : "sm:grid-cols-3 md:grid-cols-4";

  const folderItems: FolderItem[] = useMemo(
    () =>
      subfolders.map((sf) => ({
        name: sf.name,
        type: "folder" as const,
        key: subfolderKey(pathPrefix, sf.name),
        items: sf.itemCount,
        virtualFolder: true,
        hideShare: true,
        preventDelete: true,
        preventRename: true,
        preventMove: true,
      })),
    [subfolders, pathPrefix]
  );

  const panelBody =
    subfolders.length === 0 && filesHere.length === 0 ? (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing to show in this folder.</p>
      </div>
    ) : (
      <div className={`grid min-h-0 flex-1 overflow-auto ${gridGapClass} ${gridCols}`}>
        {folderItems.map((item) => (
          <div key={item.key} className="h-full min-h-0">
            <FolderCard
              item={item}
              onClick={() => setPathPrefix([...pathPrefix, item.name])}
              layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
              layoutAspectRatio={viewMode === "thumbnail" ? aspectRatio : aspectRatio}
              showCardInfo={showCardInfo}
              presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
            />
          </div>
        ))}
        {filesHere.map((file) => (
          <div key={file.id} className="h-full min-h-0 min-w-0">
            <ShareFileGridCard
              shareToken={shareToken}
              file={file}
              getAuthToken={getAuthToken}
              layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
              layoutAspectRatio={aspectRatio}
              thumbnailScale={thumbnailScale}
              presentation={viewMode === "thumbnail" ? "thumbnail" : "default"}
              showCardInfo={showCardInfo}
              onPreview={setPreviewFile}
              onDownload={onDownload}
              downloadingId={downloadingId}
              canDownload={canDownload}
            />
          </div>
        ))}
      </div>
    );

  const breadcrumbNav = (
    <nav className="flex flex-wrap items-center gap-1 border-b border-neutral-200/80 px-3 py-2.5 text-sm dark:border-neutral-700/80 sm:px-4">
      <button
        type="button"
        onClick={() => setPathPrefix([])}
        className={`max-w-[min(12rem,40vw)] truncate rounded-md px-1.5 py-0.5 text-left font-medium text-bizzi-blue hover:bg-bizzi-blue/10 hover:underline dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/15`}
        title={rootLabel}
      >
        {rootLabel}
      </button>
      {pathPrefix.map((seg, i) => (
        <Fragment key={`${i}:${seg}`}>
          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400 dark:text-neutral-500" aria-hidden />
          <button
            type="button"
            onClick={() => setPathPrefix(pathPrefix.slice(0, i + 1))}
            className="max-w-[min(10rem,28vw)] truncate rounded-md px-1.5 py-0.5 text-left font-medium text-neutral-800 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800"
            title={seg}
          >
            {seg}
          </button>
        </Fragment>
      ))}
    </nav>
  );

  const inner = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {breadcrumbNav}
      <div className="flex min-h-0 flex-1 flex-col p-3 sm:p-4">{panelBody}</div>
    </div>
  );

  if (chrome === "standalone") {
    return (
      <div className="w-full">
        <div className="flex min-h-[16rem] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-950/30 md:min-h-[min(70vh,52rem)]">
          {inner}
        </div>
        <SharePreviewModal
          shareToken={shareToken}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          getAuthToken={getAuthToken}
          canDownload={canDownload}
        />
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex h-[min(70vh,52rem)] min-h-[20rem] flex-col overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-950/30">
        {inner}
      </div>
      <SharePreviewModal
        shareToken={shareToken}
        file={previewFile}
        onClose={() => setPreviewFile(null)}
        getAuthToken={getAuthToken}
        canDownload={canDownload}
      />
    </div>
  );
}
