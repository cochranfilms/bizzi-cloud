"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTransfers } from "@/context/TransferContext";
import { File, Download, Lock, FolderOpen, Film, Play } from "lucide-react";
import Image from "next/image";
import type { Transfer, TransferFile } from "@/types/transfer";
import TransferPreviewModal from "./TransferPreviewModal";
import { useTransferThumbnail } from "@/hooks/useTransferThumbnail";
import { useTransferBulkDownload } from "@/hooks/useTransferBulkDownload";
import { useTransferVideoThumbnail } from "@/hooks/useTransferVideoThumbnail";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
}

function TransferFileRow({
  slug,
  file,
  permission,
  password,
  onRecordView,
  onPreview,
  onDownload,
}: {
  slug: string;
  file: TransferFile;
  permission: "view" | "downloadable";
  password?: string | null;
  onRecordView: (fileId: string) => void;
  onPreview: (file: TransferFile) => void;
  onDownload: (fileId: string) => void;
}) {
  const thumbnailUrl = useTransferThumbnail(slug, file.objectKey, file.name, { size: "thumb" });
  const videoThumbnailUrl = useTransferVideoThumbnail(slug, file.objectKey, file.name);
  const isVideo = isVideoFile(file.name);
  const isImage = isImageFile(file.name);
  const canPreview = !!file.objectKey;
  const hasThumbnail = (isImage && thumbnailUrl) || (isVideo && videoThumbnailUrl);

  const fetchTransferVideoStreamUrl = useCallback(async (): Promise<string | null> => {
    if (!file.objectKey) return null;
    try {
      const body: { object_key: string; password?: string } = { object_key: file.objectKey };
      if (password) body.password = password;
      const res = await fetch(
        `/api/transfers/${encodeURIComponent(slug)}/video-stream-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
  }, [slug, file.objectKey, password]);

  return (
    <div
      onMouseEnter={() => onRecordView(file.id)}
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
      className={`flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition-colors sm:flex-row sm:items-center sm:justify-between dark:border-neutral-700 dark:bg-neutral-900 ${
        canPreview
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {isVideo ? (
            <VideoScrubThumbnail
              fetchStreamUrl={fetchTransferVideoStreamUrl}
              thumbnailUrl={videoThumbnailUrl ?? thumbnailUrl}
              showPlayIcon
              className="h-full w-full"
            />
          ) : hasThumbnail ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <File className="h-7 w-7 text-neutral-500 dark:text-neutral-400" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-neutral-900 dark:text-white">{file.name}</p>
          <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
            {file.path}
          </p>
        </div>
      </div>
      {permission !== "view" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file.id);
          }}
          className="flex min-h-[44px] items-center justify-center gap-2 self-start rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue sm:self-auto dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
        >
          <Download className="h-4 w-4" />
          Download
        </button>
      )}
    </div>
  );
}

interface TransferViewProps {
  slug: string;
}

export default function TransferView({ slug }: TransferViewProps) {
  const { getTransferBySlug, addTransferFromApi, recordView, recordDownload } = useTransfers();
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [previewFile, setPreviewFile] = useState<TransferFile | null>(null);

  const localTransfer = getTransferBySlug(slug);
  const transfer = localTransfer;
  const {
    download: bulkDownload,
    isLoading: bulkDownloading,
  } = useTransferBulkDownload({
    slug,
    password: transfer?.hasPassword && unlocked ? password : null,
    onComplete: transfer
      ? () => {
          const downloadable = transfer.files.filter((f) => f.objectKey ?? f.backupFileId);
          downloadable.forEach((f) => recordDownload(slug, f.id));
        }
      : undefined,
  });

  const fetchTransfer = useCallback(async () => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/transfers/${slug}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      slug: string;
      name: string;
      clientName: string;
      clientEmail?: string;
      files: Array<{ id: string; name: string; path: string; backupFileId?: string; objectKey?: string }>;
      permission: string;
      hasPassword?: boolean;
      expiresAt: string | null;
      createdAt: string;
      status: string;
      organizationId?: string | null;
      personalTeamOwnerId?: string | null;
    };
    const t: Transfer = {
      id: data.slug,
      slug: data.slug,
      name: data.name,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      files: data.files.map((f) => ({
        ...f,
        type: "file" as const,
        views: 0,
        downloads: 0,
        backupFileId: f.backupFileId,
        objectKey: f.objectKey,
      })),
      permission: (data.permission as "view" | "downloadable") ?? "downloadable",
      hasPassword: data.hasPassword ?? false,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      status: data.status as "active" | "expired" | "cancelled",
      organizationId: data.organizationId ?? null,
      personalTeamOwnerId: data.personalTeamOwnerId ?? null,
    };
    addTransferFromApi(t);
  }, [slug, addTransferFromApi]);

  useEffect(() => {
    if (localTransfer) return;
    setFetching(true);
    fetchTransfer().finally(() => setFetching(false));
  }, [localTransfer, fetchTransfer]);

  const needsPassword = !!transfer?.hasPassword && !unlocked;

  useEffect(() => {
    if (transfer && !transfer.hasPassword) setUnlocked(true);
  }, [transfer]);

  useEffect(() => {
    if (transfer?.name && typeof document !== "undefined") {
      document.title = `${transfer.name} | Bizzi Cloud Transfer`;
    }
  }, [transfer?.name]);

  const handleUnlock = async () => {
    if (!transfer?.hasPassword || !password.trim()) return;
    setError("");
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/transfers/${encodeURIComponent(transfer.slug)}/verify-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: password.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUnlocked(true);
      } else {
        setError(data?.error ?? "Incorrect password");
      }
    } catch {
      setError("Could not verify password");
    }
  };

  const handleFileView = (fileId: string) => {
    if (!transfer) return;
    recordView(transfer.slug, fileId);
  };

  const handleFileDownload = (fileId: string) => {
    if (!transfer) return;
    recordDownload(transfer.slug, fileId);
  };

  const downloadOne = useCallback(
    async (file: TransferFile) => {
      const key = file.objectKey ?? file.backupFileId;
      if (!key) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/transfers/${encodeURIComponent(slug)}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_key: key,
          name: file.name,
          password: transfer?.hasPassword && unlocked ? password : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? data?.message ?? "Download failed");
      }
      const { url } = await res.json();
      const a = document.createElement("a");
      a.href = url.startsWith("/") ? `${window.location.origin}${url}` : url;
      a.download = file.name;
      a.rel = "noopener noreferrer";
      a.click();
      recordDownload(slug, file.id);
    },
    [slug, transfer?.hasPassword, unlocked, password, recordDownload]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!transfer || transfer.permission === "view") return;
    const downloadable = transfer.files.filter((f) => f.objectKey ?? f.backupFileId);
    if (downloadable.length === 0) return;
    const items = downloadable.map((f) => ({
      object_key: f.objectKey ?? f.backupFileId!,
      name: f.name,
    }));
    await bulkDownload(items);
  }, [transfer, bulkDownload]);

  if (!transfer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        {fetching ? (
          <>
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading transfer…</p>
          </>
        ) : (
          <>
            <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
            <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
              Transfer not found
            </h1>
            <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              This transfer may have expired or been removed.
            </p>
            <Link
              href="/"
              className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Back to home
            </Link>
          </>
        )}
      </div>
    );
  }

  if (transfer.status === "expired") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          Transfer expired
        </h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          This transfer has expired and is no longer available.
        </p>
        <Link
          href="/"
          className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Password required
            </h1>
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              This transfer is password protected. Enter the password to view files.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleUnlock();
            }}
            className="space-y-4"
          >
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Unlock
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Bizzi Byte"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-semibold text-lg tracking-tight text-neutral-900 dark:text-white">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {transfer.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Shared with you
          </p>
        </div>

        {transfer.permission !== "view" &&
          transfer.files.some((f) => f.objectKey ?? f.backupFileId) && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={bulkDownloading}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-6 py-3 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
            >
              <Download className="h-4 w-4" />
              {bulkDownloading ? "Downloading…" : "Download ALL"}
            </button>
          </div>
        )}

        <div className="space-y-2">
          {transfer.files.map((file) => (
            <TransferFileRow
              key={file.id}
              slug={slug}
              file={file}
              permission={transfer.permission}
              password={transfer.hasPassword && unlocked ? password : undefined}
              onRecordView={handleFileView}
              onPreview={setPreviewFile}
              onDownload={handleFileDownload}
            />
          ))}
        </div>

        <TransferPreviewModal
          slug={slug}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          password={transfer.hasPassword && unlocked ? password : undefined}
          permission={transfer.permission}
          onDownload={(fileId) => handleFileDownload(fileId)}
        />
      </main>
    </div>
  );
}
