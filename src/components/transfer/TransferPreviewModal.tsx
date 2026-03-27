"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, FileIcon, Loader2, Film } from "lucide-react";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";
import ImmersiveFilePreviewShell from "@/components/preview/ImmersiveFilePreviewShell";
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
  /** Perform file download (signed URL + trigger save). May be async. */
  onDownload?: (fileId: string) => void | Promise<void>;
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
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount += 1;
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
        } else if (fullUrl && pollCount >= 12) {
          // Fallback: after ~60s, if preview-url gave us a URL (proxy or original), show it
          setVideoProcessing(false);
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [slug, objectKey, previewType, password, videoProcessing, fullUrl]);

  const handleDownload = useCallback(async () => {
    if (!file || permission !== "downloadable") return;
    setDownloading(true);
    setError(null);
    try {
      await onDownload?.(file.id);
    } catch (err) {
      console.error("Download error:", err);
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [file, permission, onDownload]);

  if (!file) return null;

  const canDownload = permission === "downloadable";

  const headerActions =
    canDownload ? (
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="touch-target-sm rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-900/10 hover:text-bizzi-blue disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-bizzi-cyan"
        aria-label="Download"
      >
        <Download className="h-4 w-4" />
      </button>
    ) : null;

  let mediaBody: ReactNode = null;

  if (loading) {
    mediaBody = (
      <div className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-4 py-10">
        <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading preview…</p>
      </div>
    );
  } else if (previewType === "video" && videoProcessing && !error) {
    mediaBody = (
      <div className="flex min-h-[12rem] w-full flex-col items-center justify-center gap-6 py-12">
        <div className="relative">
          <Film className="h-16 w-16 text-bizzi-blue/60" />
          <Loader2 className="absolute -right-2 -top-2 h-8 w-8 animate-spin text-bizzi-blue" />
        </div>
        <div className="max-w-sm space-y-2 text-center">
          <p className="text-base font-medium text-neutral-900 dark:text-white">Video is processing</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your video is being prepared for streaming. Check back in a moment to preview.
          </p>
        </div>
      </div>
    );
  } else if (error) {
    mediaBody = (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-red-600 dark:text-red-400">
        <FileIcon className="h-12 w-12" />
        <p className="text-sm">{error}</p>
        {canDownload ? (
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
          >
            Download
          </button>
        ) : null}
      </div>
    );
  } else if (fullUrl && !(previewType === "video" && videoProcessing)) {
    if (previewType === "image") {
      mediaBody = (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={fullUrl}
          alt={file.name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-lg shadow-black/15"
        />
      );
    } else if (previewType === "video") {
      mediaBody = (
        <VideoWithLUT
          src={fullUrl}
          streamUrl={videoStreamUrl}
          className=""
          showLUTOption={false}
          frameless
        />
      );
    } else if (previewType === "audio") {
      mediaBody = (
        <div className="w-full max-w-md rounded-xl border border-neutral-200/60 bg-white/80 p-4 shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/60">
          <audio src={fullUrl} controls className="w-full" />
        </div>
      );
    } else if (previewType === "pdf") {
      mediaBody = (
        <iframe
          src={fullUrl}
          title={file.name}
          className="h-full max-h-full min-h-[200px] w-full max-w-4xl rounded-lg border-0 bg-white shadow-lg"
        />
      );
    } else {
      mediaBody = (
        <div className="flex max-w-md flex-col items-center gap-4 px-4 text-center text-neutral-600 dark:text-neutral-300">
          <FileIcon className="h-16 w-16" />
          <p className="text-sm">Preview not available for this file type</p>
          {canDownload ? (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
            >
              Download
            </button>
          ) : null}
        </div>
      );
    }
  }

  return (
    <ImmersiveFilePreviewShell
      variant="app"
      onClose={onClose}
      title={file.name}
      headerActions={headerActions}
      media={mediaBody}
    />
  );
}
