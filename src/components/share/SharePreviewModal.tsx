"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileIcon, Loader2, Film } from "lucide-react";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";

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

export interface ShareFile {
  id: string;
  name: string;
  path: string;
  object_key: string;
  size_bytes: number;
}

interface SharePreviewModalProps {
  shareToken: string;
  file: ShareFile | null;
  onClose: () => void;
  getAuthToken?: () => Promise<string | null>;
  /** When false, hides download button (view-only share) */
  canDownload?: boolean;
}

export default function SharePreviewModal({
  shareToken,
  file,
  onClose,
  getAuthToken,
  canDownload = true,
}: SharePreviewModalProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewType = file ? getPreviewType(file.name) : "other";
  const lowResPreviewUrl = useShareThumbnail(
    shareToken,
    file?.object_key,
    file?.name ?? "",
    { size: "preview", getAuthToken }
  );

  const fetchFullUrl = useCallback(async () => {
    if (!file?.object_key) return;
    setLoading(true);
    setError(null);
    setVideoStreamUrl(null);
    setVideoProcessing(false);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const baseUrl = `/api/shares/${encodeURIComponent(shareToken)}`;

      if (previewType === "video") {
        const previewRes = await fetch(`${baseUrl}/preview-url`, {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key }),
        });
        const previewData = await previewRes.json();
        if (!previewRes.ok)
          throw new Error(previewData?.error ?? "Failed to load preview");
        setFullUrl(previewData.url);
        fetch(`${baseUrl}/video-stream-url`, {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key }),
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
          headers,
          body: JSON.stringify({ object_key: file.object_key }),
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
  }, [shareToken, file?.object_key, previewType, getAuthToken]);

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
    if (!file?.object_key || previewType !== "video" || !videoProcessing) return;
    const baseUrl = `/api/shares/${encodeURIComponent(shareToken)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const fetchStream = async () => {
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${baseUrl}/video-stream-url`, {
        method: "POST",
        headers,
        body: JSON.stringify({ object_key: file.object_key }),
      });
      const d = await res.json().catch(() => ({}));
      if (d?.streamUrl) {
        setVideoStreamUrl(d.streamUrl);
        setVideoProcessing(false);
      } else if (!d?.processing && res.ok) setVideoProcessing(false);
    };
    const interval = setInterval(fetchStream, 6000);
    return () => clearInterval(interval);
  }, [shareToken, file?.object_key, previewType, videoProcessing, getAuthToken]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    if (!file?.object_key) return;
    setDownloading(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (getAuthToken) {
        const token = await getAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(
        `/api/shares/${encodeURIComponent(shareToken)}/download`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key, name: file.name }),
        }
      );
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
  }, [shareToken, file?.object_key, file?.name, getAuthToken]);

  if (!file) return null;

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
                aria-label="Download full resolution"
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
          {loading && !(previewType === "image" && lowResPreviewUrl) && (
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
                  <p className="text-base font-medium text-neutral-900 dark:text-white">Generating preview</p>
                  <p className="max-w-xs text-sm text-neutral-500 dark:text-neutral-400">
                    Your video is being prepared for streaming. Check back in a moment.
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
          {((previewType === "image" && lowResPreviewUrl) ||
            (previewType === "video" && fullUrl && !videoProcessing) ||
            (previewType !== "image" &&
              previewType !== "video" &&
              fullUrl)) &&
            !error && (
              <>
                {previewType === "image" && lowResPreviewUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className="relative flex w-full max-w-full items-center justify-center overflow-hidden rounded-xl bg-neutral-200 dark:bg-black"
                      style={{ aspectRatio: "16 / 9", maxHeight: "70vh" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from share thumbnail API */}
                      <img
                        src={lowResPreviewUrl}
                        alt={file.name}
                        className="max-h-full max-w-full rounded-lg object-contain"
                      />
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Low-resolution preview · Use Download for full quality
                    </p>
                  </div>
                )}
                {previewType === "video" && fullUrl && (
                  <VideoWithLUT
                    src={fullUrl}
                    streamUrl={videoStreamUrl}
                    className="max-h-[70vh] max-w-full rounded-lg"
                    showLUTOption={false}
                  />
                )}
                {previewType === "audio" && fullUrl && (
                  <div className="w-full max-w-md">
                    <audio src={fullUrl} controls className="w-full" />
                  </div>
                )}
                {previewType === "pdf" && fullUrl && (
                  <iframe
                    src={fullUrl}
                    title={file.name}
                    className="h-[70vh] w-full rounded-lg border-0"
                  />
                )}
                {previewType === "other" && fullUrl && (
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
