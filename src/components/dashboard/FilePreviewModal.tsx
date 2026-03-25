"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Download, FileIcon, Loader2, Film, FolderInput } from "lucide-react";
import HeartButton from "@/components/collaboration/HeartButton";
import FileCommentsPanel from "@/components/collaboration/FileCommentsPanel";
import { useHearts } from "@/hooks/useHearts";
import { recordRecentOpen } from "@/hooks/useRecentOpens";
import { getAuthToken } from "@/lib/auth-token";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { RecentFile } from "@/hooks/useCloudFiles";
import { useThumbnail } from "@/hooks/useThumbnail";
import VideoWithLUT, { type LUTOption } from "@/components/dashboard/VideoWithLUT";
import ImmersiveFilePreviewShell from "@/components/preview/ImmersiveFilePreviewShell";
import { isProjectFile } from "@/lib/bizzi-file-types";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i;
const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf)$/i;
const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(
  name: string,
  contentType?: string | null,
  assetType?: string | null
): "image" | "video" | "audio" | "pdf" | "project_file" | "other" {
  if (assetType === "project_file" || isProjectFile(name)) return "project_file";
  const lower = name.toLowerCase();
  if (IMAGE_EXT.test(lower)) return "image";
  if (VIDEO_EXT.test(lower)) return "video";
  if (AUDIO_EXT.test(lower)) return "audio";
  if (PDF_EXT.test(lower)) return "pdf";
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
  /** @deprecated Use lutConfig + lutLibrary for Creator RAW. When true, show Sony Rec 709 LUT toggle. */
  showLUTForVideo?: boolean;
  /** LUT config for Creator RAW drive. When provided with lutLibrary, enables full LUT dropdown. */
  lutConfig?: CreativeLUTConfig | null;
  /** LUT library for Creator RAW drive. Entries with signed_url become dropdown options. */
  lutLibrary?: CreativeLUTLibraryEntry[] | null;
}

function buildLUTOptions(
  library: CreativeLUTLibraryEntry[],
  includeBuiltin: boolean
): LUTOption[] {
  const opts: LUTOption[] = [];
  if (includeBuiltin) {
    opts.push({ id: "sony_rec709", name: "Sony Rec 709", source: "sony_rec709", isBuiltin: true });
  }
  for (const e of library) {
    if (e.signed_url) {
      opts.push({ id: e.id, name: e.name, source: e.signed_url, isBuiltin: false });
    }
  }
  return opts;
}

export default function FilePreviewModal({
  file,
  onClose,
  showLUTForVideo = false,
  lutConfig = null,
  lutLibrary = null,
}: FilePreviewModalProps) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lutEnabled, setLutEnabled] = useState(false);

  const previewType = file ? getPreviewType(file.name, file.contentType, file.assetType) : "other";
  const hearts = useHearts(file?.id ?? null);

  useEffect(() => {
    if (file?.id) {
      recordRecentOpen("file", file.id, getAuthToken);
    }
  }, [file?.id]);

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

  // Poll video-stream-url when processing (proxy/Mux not ready yet)
  useEffect(() => {
    if (!file?.objectKey || previewType !== "video" || !videoProcessing) return;
    const token = getFirebaseAuth().currentUser;
    if (!token) return;
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount += 1;
      try {
        const t = await token.getIdToken(true);
        const res = await fetch("/api/backup/video-stream-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ object_key: file.objectKey, user_id: token.uid }),
        });
        const data = await res.json().catch(() => ({}));
        if (data?.streamUrl) {
          setVideoStreamUrl(data.streamUrl);
          setVideoProcessing(false);
        } else if (!data?.processing && res.ok) {
          setVideoProcessing(false);
        } else if (fullUrl && pollCount >= 10) {
          // Fallback: after ~60s, if preview-url gave us a URL (proxy or original), show it
          setVideoProcessing(false);
        }
      } catch {
        // ignore polling errors
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [file?.objectKey, previewType, videoProcessing, fullUrl]);


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

  const lutOptions: LUTOption[] =
    lutConfig && lutLibrary
      ? buildLUTOptions(lutLibrary, true)
      : showLUTForVideo
        ? [{ id: "sony_rec709", name: "Sony Rec 709", source: "sony_rec709", isBuiltin: true }]
        : [];
  const lutSource =
    lutConfig?.selected_lut_id &&
    lutOptions.some((o) => o.id === lutConfig.selected_lut_id)
      ? lutOptions.find((o) => o.id === lutConfig.selected_lut_id)!.source
      : lutOptions[0]?.source ?? null;
  const showLUT = lutOptions.length > 0;

  if (!file) return null;

  const headerActions = (
    <>
      {file.id ? (
        <HeartButton
          count={hearts.count}
          hasHearted={hearts.hasHearted}
          loading={hearts.loading}
          onToggle={hearts.toggle}
          size="sm"
          showCount
        />
      ) : null}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="touch-target-sm rounded-lg p-2 text-neutral-600 transition-colors hover:bg-neutral-900/10 hover:text-bizzi-blue disabled:opacity-50 dark:text-neutral-200 dark:hover:bg-white/10 dark:hover:text-bizzi-cyan"
        aria-label="Download full resolution"
      >
        <Download className="h-4 w-4" />
      </button>
    </>
  );

  let mediaBody: ReactNode = null;
  let mediaFooter: ReactNode = null;

  if (loading && !(previewType === "image" && lowResPreviewUrl)) {
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
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
        >
          Download
        </button>
      </div>
    );
  } else if (
    (previewType === "image" && lowResPreviewUrl) ||
    (previewType === "video" && fullUrl && !videoProcessing) ||
    previewType === "project_file" ||
    ((previewType === "audio" || previewType === "pdf" || previewType === "other") && fullUrl)
  ) {
    if (previewType === "image" && lowResPreviewUrl) {
      mediaBody = (
        /* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API */
        <img
          src={lowResPreviewUrl}
          alt={file.name}
          className="max-h-[min(85vh,920px)] max-w-full rounded-lg object-contain shadow-lg shadow-black/15"
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
          className="max-h-[min(85vh,920px)] max-w-full"
          showLUTOption={showLUT}
          lutSource={lutSource}
          lutOptions={lutOptions}
          onLutChange={setLutEnabled}
          frameless
          sideBySideLut={showLUT}
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
          className="h-[min(85vh,920px)] w-full max-w-4xl rounded-lg border-0 bg-white shadow-lg"
        />
      );
    } else if (previewType === "project_file") {
      mediaBody = (
        <div className="flex max-w-md flex-col items-center gap-4 px-4 text-center text-neutral-600 dark:text-neutral-300">
          <FolderInput className="h-16 w-16 text-bizzi-blue" />
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            Preview not supported for this project file
          </p>
          <p className="text-sm">Download or open locally to use this file</p>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-blue/90 disabled:opacity-50"
          >
            Download
          </button>
        </div>
      );
    } else if (previewType === "other" && fullUrl) {
      mediaBody = (
        <div className="flex max-w-md flex-col items-center gap-4 px-4 text-center text-neutral-600 dark:text-neutral-300">
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
      belowFold={
        file.id ? (
          <div className="rounded-2xl border border-neutral-200/70 bg-white/85 p-5 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-neutral-950/55">
            <FileCommentsPanel fileId={file.id} />
          </div>
        ) : null
      }
    />
  );
}
