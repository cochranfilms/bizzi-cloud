"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileIcon, Loader2, Film } from "lucide-react";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";
import type { TransferFile } from "@/types/transfer";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(name: string): "image" | "video" | "audio" | "pdf" | "other" {
  const lower = name.toLowerCase();
  if (IMAGE_EXT.test(lower)) return "image";
  if (VIDEO_EXT.test(lower)) return "video";
  if (AUDIO_EXT.test(lower)) return "audio";
  if (PDF_EXT.test(lower)) return "pdf";
  return "other";
}

interface TransferPreviewModalProps {
  slug: string;
  file: TransferFile | null;
  onClose: () => void;
  /** Password for password-protected transfers (pass when user has unlocked) */
  password?: string | null;
  /** When "view", hide download button. When "downloadable", show it. */
  permission?: "view" | "downloadable";
  onDownload?: (fileId: string) => void;
}

export default function TransferPreviewModal({
  slug,
  file,
  onClose,
  password,
  permission = "downloadable",
  onDownload,
}: TransferPreviewModalProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const objectKey = file?.objectKey;
  const previewType = file ? getPreviewType(file.name) : "other";

  const fetchFullUrl = useCallback(async () => {
    if (!file?.objectKey) return;
    setLoading(true);
    setError(null);
    setVideoStreamUrl(null);
    setVideoProcessing(false);
    try {
      const body: { object_key: string; password?: string } = {
        object_key: objectKey!,
      };
      if (password) body.password = password;

      const baseUrl = `/api/transfers/${encodeURIComponent(slug)}`;

      if (previewType === "video") {
        const previewRes = await fetch(`${baseUrl}/preview-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const previewData = await previewRes.json();
        if (!previewRes.ok)
          throw new Error(previewData?.error ?? "Failed to load preview");
        setFullUrl(previewData.url);
        fetch(`${baseUrl}/video-stream-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d?.processing) setVideoProcessing(true);
            else if (d?.streamUrl) setVideoStreamUrl(d.streamUrl);
          })
          .catch(() => {});
      } else {
        const res = await fetch(`${baseUrl}/preview-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed to load preview");
        setFullUrl(data.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [slug, file, objectKey, previewType, password]);

  useEffect(() => {
    if (file) fetchFullUrl();
    else {
      setFullUrl(null);
      setVideoStreamUrl(null);
      setVideoProcessing(false);
      setError(null);
    }
  }, [file, fetchFullUrl]);

  // Poll video-stream-url when processing (proxy not ready)
  useEffect(() => {
    if (!objectKey || previewType !== "video" || !videoProcessing) return;
    const body: { object_key: string; password?: string } = { object_key: objectKey };
    if (password) body.password = password;
    const baseUrl = `/api/transfers/${encodeURIComponent(slug)}`;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(baseUrl + "/video-stream-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.streamUrl) {
          setVideoStreamUrl(data.streamUrl);
          setVideoProcessing(false);
        } else if (!data?.processing && res.ok) {
          setVideoProcessing(false);
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [slug, objectKey, previewType, password, videoProcessing]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    if (!file || permission !== "downloadable") return;
    setDownloading(true);
    try {
      onDownload?.(file.id);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/transfers/${slug}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id: file.id,
          object_key: file.objectKey,
          name: file.name,
          password: password || undefined,
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
    } catch (err) {
      console.error("Download error:", err);
    } finally {
      setDownloading(false);
    }
  }, [slug, file, password, permission, onDownload]);

  if (!file) return null;

  const canDownload = permission === "downloadable";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/60 p-4 backdrop-blur-sm dark:bg-black/70"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="truncate text-sm font-medium text-neutral-900 dark:text-white" title={file.name}>
            {file.name}
          </h2>
          <div className="flex items-center gap-2">
            {canDownload && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white"
                aria-label="Download"
              >
                <Download className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-neutral-50 p-6 dark:bg-neutral-950">
          {loading && (
            <div
              className="flex w-full max-w-full items-center justify-center rounded-xl ring-2 ring-neutral-200 shadow-xl dark:ring-neutral-700/50"
              style={{ aspectRatio: "16 / 9", maxHeight: "70vh" }}
            >
              <div className="flex flex-col items-center gap-3 text-neutral-500 dark:text-neutral-400">
                <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
                <p className="text-sm">Loading preview…</p>
              </div>
            </div>
          )}
          {previewType === "video" && videoProcessing && !error && (
            <div
              className="flex w-full max-w-full items-center justify-center rounded-xl ring-2 ring-neutral-200 shadow-xl dark:ring-neutral-700/50"
              style={{ aspectRatio: "16 / 9", maxHeight: "70vh" }}
            >
              <div className="flex flex-col items-center gap-6 rounded-2xl border border-neutral-200 bg-neutral-100 px-12 py-14 dark:border-neutral-700/50 dark:bg-neutral-800/50">
                <div className="relative">
                  <Film className="h-16 w-16 text-bizzi-blue/60" />
                  <Loader2 className="absolute -right-2 -top-2 h-8 w-8 animate-spin text-bizzi-blue" />
                </div>
                <div className="space-y-2 text-center">
                  <p className="text-base font-medium text-neutral-900 dark:text-white">Video is processing</p>
                  <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
                    Your video is being prepared for streaming. Check back in a moment to preview.
                  </p>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-3 text-red-600 dark:text-red-400">
              <FileIcon className="h-12 w-12" />
              <p className="text-sm">{error}</p>
              {canDownload && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
                >
                  Download
                </button>
              )}
            </div>
          )}
          {fullUrl && !error && !loading && !(previewType === "video" && videoProcessing) && (
            <>
              {previewType === "image" && (
                <div
                  className="relative flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-200 dark:bg-black"
                  style={{ aspectRatio: "16 / 9", maxHeight: "70vh" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={fullUrl}
                    alt={file.name}
                    className="max-h-full max-w-full rounded-lg object-contain"
                  />
                </div>
              )}
              {previewType === "video" && (
                <VideoWithLUT
                  src={fullUrl}
                  streamUrl={videoStreamUrl}
                  className="max-h-[70vh] max-w-full rounded-lg"
                  showLUTOption={false}
                />
              )}
              {previewType === "audio" && (
                <div className="w-full max-w-md">
                  <audio src={fullUrl} controls className="w-full" />
                </div>
              )}
              {previewType === "pdf" && (
                <iframe
                  src={fullUrl}
                  title={file.name}
                  className="h-[70vh] w-full rounded-lg border-0"
                />
              )}
              {previewType === "other" && (
                <div className="flex flex-col items-center gap-4 text-neutral-500 dark:text-neutral-400">
                  <FileIcon className="h-16 w-16" />
                  <p className="text-sm">Preview not available for this file type</p>
                  {canDownload && (
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
                    >
                      Download
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
