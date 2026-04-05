"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { File, Download, FolderOpen, Film, Lock, Play } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import { useShareVideoThumbnail } from "@/hooks/useShareVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import SharePreviewModal, { type ShareFile } from "./SharePreviewModal";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ShareFileRow({
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

export interface SharedFolderContentProps {
  token: string;
  /** When true, renders without outer padding (for dashboard) */
  embedded?: boolean;
  /** When provided, called with folder_name when data loads (for TopBar in dashboard) */
  onFolderNameLoaded?: (name: string) => void;
}

type SharePayload = {
  folder_name: string;
  permission: string;
  files: ShareFile[];
  workspace_delivery_status?: string;
  viewer_can_moderate_delivery?: boolean;
  is_viewer_share_owner?: boolean;
};

export default function SharedFolderContent({ token, embedded, onFolderNameLoaded }: SharedFolderContentProps) {
  const { user } = useAuth();
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ShareFile | null>(null);
  const [deliveryActionLoading, setDeliveryActionLoading] = useState(false);

  const fetchShare = useCallback(async () => {
    setError(null);
    setErrorCode(null);
    try {
      const headers: Record<string, string> = {};
      if (user) {
        const idToken = await user.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, { headers });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message ?? body.error ?? `Failed to load (${res.status})`);
        setErrorCode(body.error ?? null);
        return;
      }
      setData(body);
      if (body?.folder_name && onFolderNameLoaded) {
        onFolderNameLoaded(body.folder_name);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [token, user, onFolderNameLoaded]);

  useEffect(() => {
    fetchShare();
  }, [fetchShare]);

  const handleWorkspaceDelivery = useCallback(
    async (action: "approve" | "reject") => {
      if (!user) return;
      setDeliveryActionLoading(true);
      try {
        const idToken = await user.getIdToken();
        const res = await fetch(
          `/api/shares/${encodeURIComponent(token)}/workspace-delivery`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ action }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body.error as string) ?? "Could not update share");
        }
        await fetchShare();
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setDeliveryActionLoading(false);
      }
    },
    [user, token, fetchShare]
  );

  const singleFileOriginalName = useMemo(() => {
    if (!data || data.files.length !== 1) return null;
    const n = data.files[0]!.name;
    return n && n !== data.folder_name ? n : null;
  }, [data]);

  const handleDownload = useCallback(
    async (file: ShareFile) => {
      setDownloadingId(file.id);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download`, {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key, name: file.name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? "Download failed");
        }
        const { url } = await res.json();
        const a = document.createElement("a");
        a.href = url.startsWith("/") ? `${window.location.origin}${url}` : url;
        a.download = file.name;
        a.rel = "noopener noreferrer";
        a.click();
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setDownloadingId(null);
      }
    },
    [token, user]
  );

  const getAuthToken = useCallback(async () => {
    return user ? user.getIdToken() : null;
  }, [user]);

  const isExpired = error?.toLowerCase().includes("expired");
  const isPrivateAuth = errorCode === "private_share_requires_auth";

  const canDownload = data != null && data.permission !== "view";
  const permissionLabel = canDownload ? "Download" : "View only";

  return (
    <DashboardRouteFade
      ready={!loading}
      srOnlyMessage="Loading shared folder"
      compact={embedded}
    >
    {error || !data ? (
      isPrivateAuth && !embedded ? (
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
          <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                This folder is private
              </h1>
              <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                {error ?? "Sign in to access if you have been invited."}
              </p>
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/s/${token}`)}`}
              className="flex w-full items-center justify-center rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Sign in to access
            </Link>
          </div>
        </div>
      ) : (
      <div className={`flex flex-col items-center justify-center gap-4 ${embedded ? "py-16" : "min-h-[40vh] py-16"}`}>
        <FolderOpen className="h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {isExpired ? "Share expired" : "Share not found"}
        </h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This share may have been removed."}
        </p>
        <Link
          href="/"
          className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          Back to home
        </Link>
      </div>
      )
    ) : (
    <div className={embedded ? "" : "space-y-6"}>
      {data.workspace_delivery_status === "pending" && data.viewer_can_moderate_delivery && (
        <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-50 p-4 dark:border-amber-700/60 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Someone outside your workspace shared “{data.folder_name}”. Approve to show it to your
            team in Shared, or deny to keep it admin-only.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deliveryActionLoading}
              onClick={() => void handleWorkspaceDelivery("approve")}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {deliveryActionLoading ? "…" : "Approve for workspace"}
            </button>
            <button
              type="button"
              disabled={deliveryActionLoading}
              onClick={() => void handleWorkspaceDelivery("reject")}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-white dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              Deny
            </button>
          </div>
        </div>
      )}
      {data.workspace_delivery_status === "pending" && data.is_viewer_share_owner && (
        <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-200">
          This share is waiting for a workspace admin to approve it before your team can see it in
          Shared.
        </div>
      )}
      {embedded && singleFileOriginalName ? (
        <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
          Original file:{" "}
          <span className="font-mono text-xs text-neutral-600 dark:text-neutral-300">
            {singleFileOriginalName}
          </span>
        </p>
      ) : null}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {data.folder_name}
          </h1>
          {singleFileOriginalName ? (
            <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
              Original file: {singleFileOriginalName}
            </p>
          ) : null}
          <p className="mt-1 flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <span>Shared with you · {data.files.length} {data.files.length === 1 ? "file" : "files"}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                canDownload
                  ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
              }`}
            >
              {permissionLabel}
            </span>
          </p>
        </div>
      )}

      {data.files.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
          <FolderOpen className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
          <p className="text-neutral-500 dark:text-neutral-400">
            This folder is empty.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {data.files.map((file) => (
              <ShareFileRow
                key={file.id}
                shareToken={token}
                file={file}
                getAuthToken={user ? getAuthToken : undefined}
                onDownload={handleDownload}
                onPreview={setPreviewFile}
                downloadingId={downloadingId}
                canDownload={canDownload}
              />
            ))}
          </div>
          <SharePreviewModal
            shareToken={token}
            file={previewFile}
            onClose={() => setPreviewFile(null)}
            getAuthToken={user ? getAuthToken : undefined}
            canDownload={canDownload}
          />
        </>
      )}
    </div>
    )}
    </DashboardRouteFade>
  );
}
