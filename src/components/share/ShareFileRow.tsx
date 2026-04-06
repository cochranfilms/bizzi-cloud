"use client";

import { useCallback } from "react";
import { File, Download } from "lucide-react";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import { useShareVideoThumbnail } from "@/hooks/useShareVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";
import type { ShareFile } from "./SharePreviewModal";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShareFileRow({
  shareToken,
  file,
  getAuthToken,
  onDownload,
  onPreview,
  downloadingId,
  canDownload,
}: {
  shareToken: string;
  file: ShareFile;
  getAuthToken?: () => Promise<string | null>;
  onDownload: (file: ShareFile) => void;
  onPreview: (file: ShareFile) => void;
  downloadingId: string | null;
  canDownload: boolean;
}) {
  const [rowRef, isInView] = useInView<HTMLDivElement>();
  const thumbnailUrl = useShareThumbnail(shareToken, file.object_key, file.name, {
    size: "thumb",
    enabled: isInView,
    getAuthToken,
  });
  const videoThumbnailUrl = useShareVideoThumbnail(
    shareToken,
    file.object_key,
    file.name,
    { enabled: isInView, getAuthToken }
  );
  const isVideo = isVideoFile(file.name);
  const canPreview = !!file.object_key;
  const shareCreative = resolveCreativeProjectTile({
    name: file.name,
    path: file.path || file.name,
  });

  const fetchShareVideoStreamUrl = useCallback(async (): Promise<string | null> => {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (getAuthToken) {
        const t = await getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(
        `/api/shares/${encodeURIComponent(shareToken)}/video-stream-url`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key }),
        }
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { streamUrl?: string };
      const url = data?.streamUrl;
      if (!url) return null;
      return url.startsWith("/") ? `${window.location.origin}${url}` : url;
    } catch {
      return null;
    }
  }, [shareToken, file.object_key, getAuthToken]);

  return (
    <div
      ref={rowRef}
      className={`flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700 dark:bg-neutral-900 ${
        canPreview
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : ""
      }`}
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
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {isVideo ? (
            <VideoScrubThumbnail
              fetchStreamUrl={fetchShareVideoStreamUrl}
              thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
              showPlayIcon
              className="h-full w-full"
            />
          ) : (thumbnailUrl || videoThumbnailUrl) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
            </>
          ) : shareCreative.mode === "branded_project" ? (
            <BrandedProjectTile
              brandId={shareCreative.brandId}
              tileVariant={shareCreative.tileVariant}
              fileName={file.name}
              displayLabel={shareCreative.displayLabel}
              extensionLabel={shareCreative.extensionLabel}
              size="md"
              className="h-full w-full"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <File className="h-7 w-7 text-neutral-500 dark:text-neutral-400" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-neutral-900 dark:text-white">
            {file.name}
          </p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {formatSize(file.size_bytes)}
          </p>
        </div>
      </div>
      {canDownload && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file);
          }}
          disabled={downloadingId === file.id}
          className="min-h-[44px] flex flex-shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue disabled:opacity-50 sm:ml-4 sm:self-auto dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
        >
          <Download className="h-4 w-4" />
          {downloadingId === file.id ? "Downloading…" : "Download"}
        </button>
      )}
    </div>
  );
}
