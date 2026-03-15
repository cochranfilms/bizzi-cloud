"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { File, Download, FolderOpen, Film, Lock, Play } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import { useShareVideoThumbnail } from "@/hooks/useShareVideoThumbnail";
import { useInView } from "@/hooks/useInView";
import SharePreviewModal, { type ShareFile } from "./SharePreviewModal";

interface ShareViewProps {
  token: string;
}

interface ShareData {
  folder_name: string;
  permission: string;
  files: ShareFile[];
}

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;

function isVideoFile(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}
function isImageFile(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
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
  const isImage = isImageFile(file.name);
  const canPreview = !!file.object_key;

  return (
    <div
      ref={rowRef}
      className={`flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
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
          {(thumbnailUrl || videoThumbnailUrl) ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={videoThumbnailUrl ?? thumbnailUrl ?? ""}
                alt=""
                className="h-full w-full object-cover"
              />
              {isVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                    <Play className="ml-1 h-5 w-5 fill-white text-white" />
                  </div>
                </div>
              )}
            </>
          ) : isVideo ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <Film className="h-7 w-7 text-neutral-500 dark:text-neutral-400" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50">
                  <Play className="ml-1 h-5 w-5 fill-white text-white" />
                </div>
              </div>
            </div>
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
          className="ml-4 flex flex-shrink-0 items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
        >
          <Download className="h-4 w-4" />
          {downloadingId === file.id ? "Downloading…" : "Download"}
        </button>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ShareView({ token }: ShareViewProps) {
  const { user } = useAuth();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<ShareFile | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchShare() {
      setError(null);
      setErrorCode(null);
      try {
        const headers: Record<string, string> = {};
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
          headers,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setError(body.message ?? body.error ?? `Failed to load (${res.status})`);
            setErrorCode(body.error ?? null);
          }
          return;
        }
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchShare();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

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

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 animate-pulse text-neutral-300 dark:text-neutral-600" />
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    const isExpired = error?.toLowerCase().includes("expired");
    const isPrivateAuth = errorCode === "private_share_requires_auth";

    if (isPrivateAuth) {
      return (
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
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
              Don&apos;t have access? Ask the owner to add you by email.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          {isExpired ? "Share expired" : "Share not found"}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This share may have been removed."}
        </p>
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
              alt="Bizzi Cloud"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {data.folder_name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Shared with you · {data.files.length}{" "}
            {data.files.length === 1 ? "file" : "files"}
          </p>
        </div>

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
                  canDownload={data.permission !== "view"}
                />
              ))}
            </div>
            <SharePreviewModal
              shareToken={token}
              file={previewFile}
              onClose={() => setPreviewFile(null)}
              getAuthToken={user ? getAuthToken : undefined}
              canDownload={data.permission !== "view"}
            />
          </>
        )}
      </main>
    </div>
  );
}
