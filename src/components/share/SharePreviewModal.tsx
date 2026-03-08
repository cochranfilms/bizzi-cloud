"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileIcon, Loader2 } from "lucide-react";
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
}

export default function SharePreviewModal({
  shareToken,
  file,
  onClose,
  getAuthToken,
}: SharePreviewModalProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
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
          .then((d) => d?.streamUrl && setVideoStreamUrl(d.streamUrl))
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
      setError(null);
    }
  }, [file, fetchFullUrl]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="truncate text-sm font-medium text-white" title={file.name}>
            {file.name}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-50"
              aria-label="Download full resolution"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-neutral-950 p-6">
          {loading && !(previewType === "image" && lowResPreviewUrl) && (
            <div className="flex flex-col items-center gap-3 text-neutral-400">
              <Loader2 className="h-10 w-10 animate-spin" />
              <p className="text-sm">Loading preview…</p>
            </div>
          )}
          {error && (
            <div className="flex flex-col items-center gap-3 text-red-400">
              <FileIcon className="h-12 w-12" />
              <p className="text-sm">{error}</p>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
              >
                Download
              </button>
            </div>
          )}
          {((previewType === "image" && lowResPreviewUrl) ||
            (previewType === "video" && fullUrl) ||
            (previewType !== "image" &&
              previewType !== "video" &&
              fullUrl)) &&
            !error && (
              <>
                {previewType === "image" && lowResPreviewUrl && (
                  <div className="flex flex-col items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from share thumbnail API */}
                    <img
                      src={lowResPreviewUrl}
                      alt={file.name}
                      className="max-h-[70vh] max-w-full rounded-lg object-contain"
                    />
                    <p className="text-xs text-neutral-500">
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
                  <div className="flex flex-col items-center gap-4 text-neutral-400">
                    <FileIcon className="h-16 w-16" />
                    <p className="text-sm">Preview not available for this file type</p>
                    <button
                      type="button"
                      onClick={handleDownload}
                      disabled={downloading}
                      className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
                    >
                      Download
                    </button>
                  </div>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
