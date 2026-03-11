"use client";

import { useCallback, useEffect, useState } from "react";
import { X, Download, FileIcon, Loader2, Film, ImageIcon, FileAudio } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useThumbnail } from "@/hooks/useThumbnail";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(name: string, contentType?: string | null): "image" | "video" | "audio" | "pdf" | "other" {
  const lower = name.toLowerCase();
  if (IMAGE_EXT.test(lower)) return "image";
  if (VIDEO_EXT.test(lower)) return "video";
  if (AUDIO_EXT.test(lower)) return "audio";
  if (PDF_EXT.test(lower)) return "pdf";
  // Fallback: use stored MIME type (persists across rename, e.g. renamed video without .mp4)
  if (contentType) {
    const ct = contentType.toLowerCase();
    if (ct.startsWith("image/")) return "image";
    if (ct.startsWith("video/")) return "video";
    if (ct.startsWith("audio/")) return "audio";
    if (ct === "application/pdf") return "pdf";
  }
  return "other";
}

interface FilePreviewModalProps {
  file: RecentFile | null;
  onClose: () => void;
  /** When true, show Rec 709 LUT toggle for videos (RAW folder only). Default: false. */
  showLUTForVideo?: boolean;
}

export default function FilePreviewModal({ file, onClose, showLUTForVideo = false }: FilePreviewModalProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lutEnabled, setLutEnabled] = useState(false);

  const previewType = file ? getPreviewType(file.name, file.contentType) : "other";
  const lowResPreviewUrl = useThumbnail(
    file?.objectKey,
    file?.name ?? "",
    "preview"
  );

  const fetchFullUrl = useCallback(async () => {
    if (!file?.objectKey) return;
    setLoading(true);
    setError(null);
    setVideoStreamUrl(null);
    setVideoProcessing(false);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) throw new Error("Not authenticated");
      const uid = getFirebaseAuth().currentUser?.uid;
      const payload = {
        object_key: file.objectKey,
        user_id: uid,
      };

      if (previewType === "video") {
        const [previewRes, streamRes] = await Promise.all([
          fetch("/api/backup/preview-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          }),
          fetch("/api/backup/video-stream-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          }),
        ]);
        const previewData = await previewRes.json();
        if (!previewRes.ok) throw new Error(previewData?.error ?? "Failed to load preview");
        setFullUrl(previewData.url);
        const streamData = await streamRes.json().catch(() => ({}));
        if (streamData?.processing) setVideoProcessing(true);
        else if (streamData?.streamUrl) setVideoStreamUrl(streamData.streamUrl);
      } else {
        const res = await fetch("/api/backup/preview-url", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
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
  }, [file?.objectKey, previewType]);

  useEffect(() => {
    if (file) {
      fetchFullUrl();
      setLutEnabled(false);
    } else {
      setFullUrl(null);
      setVideoStreamUrl(null);
      setVideoProcessing(false);
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
    if (!file?.objectKey) return;
    setDownloading(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!token) throw new Error("Not authenticated");
      const uid = getFirebaseAuth().currentUser?.uid;
      const res = await fetch("/api/backup/download", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          object_key: file.objectKey,
          name: file.name,
          user_id: uid,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Download failed");
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
  }, [file?.objectKey, file?.name]);

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-neutral-700/80 bg-neutral-900 shadow-2xl shadow-bizzi-blue/5 ring-1 ring-white/5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700/80 bg-gradient-to-r from-neutral-900 via-neutral-900/95 to-neutral-900 px-5 py-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10">
              {previewType === "video" ? (
                <Film className="h-4 w-4 text-bizzi-blue" />
              ) : previewType === "image" ? (
                <ImageIcon className="h-4 w-4 text-bizzi-blue" />
              ) : previewType === "audio" ? (
                <FileAudio className="h-4 w-4 text-bizzi-blue" />
              ) : (
                <FileIcon className="h-4 w-4 text-bizzi-blue" />
              )}
            </div>
            <h2 className="truncate text-sm font-medium text-white" title={file.name}>
              {file.name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg p-2.5 text-neutral-400 transition-all hover:bg-bizzi-blue/10 hover:text-bizzi-blue disabled:opacity-50"
              aria-label="Download full resolution"
            >
              <Download className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2.5 text-neutral-400 transition-all hover:bg-bizzi-blue/10 hover:text-bizzi-blue"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex min-h-[40vh] flex-1 items-center justify-center overflow-auto bg-gradient-to-b from-neutral-950 to-neutral-900/80 p-6">
          {loading && !(previewType === "image" && lowResPreviewUrl) && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-neutral-700/50 bg-neutral-800/50 px-12 py-10">
              <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
              <p className="text-sm text-neutral-400">Loading preview…</p>
            </div>
          )}
          {previewType === "video" && videoProcessing && !error && (
            <div className="flex flex-col items-center gap-6 rounded-2xl border border-neutral-700/50 bg-neutral-800/50 px-12 py-14">
              <div className="relative">
                <Film className="h-16 w-16 text-bizzi-blue/60" />
                <Loader2 className="absolute -right-2 -top-2 h-8 w-8 animate-spin text-bizzi-blue" />
              </div>
              <div className="space-y-2 text-center">
                <p className="text-base font-medium text-white">Video is processing</p>
                <p className="max-w-xs text-sm text-neutral-400">
                  Your video is being prepared for streaming. Check back in a moment to preview.
                </p>
              </div>
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
            (previewType === "video" && fullUrl && !videoProcessing) ||
            (previewType !== "image" && previewType !== "video" && fullUrl)) &&
            !error && (
              <>
                {previewType === "image" && lowResPreviewUrl && (
                  <div className="flex flex-col items-center gap-3">
                    <div className="overflow-hidden rounded-xl ring-2 ring-neutral-700/50 ring-offset-2 ring-offset-neutral-900 shadow-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API */}
                      <img
                        src={lowResPreviewUrl}
                        alt={file.name}
                        className="max-h-[70vh] max-w-full object-contain"
                      />
                    </div>
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
                    showLUTOption={showLUTForVideo}
                    onLutChange={setLutEnabled}
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
