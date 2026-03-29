"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, FileIcon, Loader2, Film } from "lucide-react";
import { useShareThumbnail } from "@/hooks/useShareThumbnail";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";
import ImmersiveFilePreviewShell from "@/components/preview/ImmersiveFilePreviewShell";
import { isProjectFile } from "@/lib/bizzi-file-types";
import { resolveCreativeProjectTile } from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(
  name: string
): "image" | "video" | "audio" | "pdf" | "project_file" | "other" {
  if (isProjectFile(name)) return "project_file";
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
    if (previewType === "project_file") {
      setLoading(false);
      setError(null);
      setFullUrl(null);
      return;
    }
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
    let pollCount = 0;
    const fetchStream = async () => {
      pollCount += 1;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
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
      } else if (!d?.processing && res.ok) {
        setVideoProcessing(false);
      } else if (fullUrl && pollCount >= 10) {
        // Fallback: after ~60s, if preview-url gave us a URL (proxy or original), show it
        setVideoProcessing(false);
      }
    };
    const interval = setInterval(fetchStream, 6000);
    return () => clearInterval(interval);
  }, [shareToken, file?.object_key, previewType, videoProcessing, fullUrl, getAuthToken]);

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

  const headerActions =
    canDownload ? (
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="touch-target-sm rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-900/10 hover:text-bizzi-blue disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-bizzi-cyan"
        aria-label="Download full resolution"
      >
        <Download className="h-4 w-4" />
      </button>
    ) : null;

  let mediaBody: ReactNode = null;
  let mediaFooter: ReactNode = null;

  if (previewType === "project_file") {
    const pc = resolveCreativeProjectTile({
      name: file.name,
      path: file.path || file.name,
    });
    mediaBody = (
      <div className="flex max-w-md flex-col items-center gap-4 px-4 text-center text-neutral-600 dark:text-neutral-300">
        {pc.mode === "branded_project" ? (
          <div className="h-52 w-full max-w-[14rem]">
            <BrandedProjectTile
              brandId={pc.brandId}
              tileVariant={pc.tileVariant}
              fileName={file.name}
              displayLabel={pc.displayLabel}
              extensionLabel={pc.extensionLabel}
              size="xl"
              className="h-full w-full"
            />
          </div>
        ) : (
          <FileIcon className="h-16 w-16" />
        )}
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          Preview not supported for this project file
        </p>
        <p className="text-sm">Download to open in your editing app</p>
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
  } else if (loading && !(previewType === "image" && lowResPreviewUrl)) {
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
          <p className="text-base font-medium text-neutral-900 dark:text-white">Generating preview</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Your video is being prepared for streaming. Check back in a moment.
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
  } else if (
    (previewType === "image" && lowResPreviewUrl) ||
    (previewType === "video" && fullUrl && !videoProcessing) ||
    (previewType !== "image" && previewType !== "video" && fullUrl)
  ) {
    if (previewType === "image" && lowResPreviewUrl) {
      mediaBody = (
        /* eslint-disable-next-line @next/next/no-img-element -- Blob URL from share thumbnail API */
        <img
          src={lowResPreviewUrl}
          alt={file.name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-lg shadow-black/15"
        />
      );
      mediaFooter = (
        <p className="mt-3 text-center text-xs text-neutral-600 dark:text-neutral-400">
          Low-resolution preview · Use Download for full quality
        </p>
      );
    } else if (previewType === "video" && fullUrl) {
      mediaBody = (
        <VideoWithLUT
          src={fullUrl}
          streamUrl={videoStreamUrl}
          className=""
          showLUTOption={false}
          frameless
        />
      );
    } else if (previewType === "audio" && fullUrl) {
      mediaBody = (
        <div className="w-full max-w-md rounded-xl border border-neutral-200/60 bg-white/80 p-4 shadow-md backdrop-blur-sm dark:border-white/10 dark:bg-neutral-900/60">
          <audio src={fullUrl} controls className="w-full" />
        </div>
      );
    } else if (previewType === "pdf" && fullUrl) {
      mediaBody = (
        <iframe
          src={fullUrl}
          title={file.name}
          className="h-full max-h-full min-h-[200px] w-full max-w-4xl rounded-lg border-0 bg-white shadow-lg"
        />
      );
    } else if (previewType === "other" && fullUrl) {
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
      mediaFooter={mediaFooter}
    />
  );
}
