"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileIcon, FolderInput, ZoomIn, ZoomOut } from "lucide-react";
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
import { useThemeResolved } from "@/context/ThemeContext";
import { isProjectFile } from "@/lib/bizzi-file-types";
import { GALLERY_IMAGE_EXT } from "@/lib/gallery-file-types";
import { shouldUseVideoThumbnailPipeline } from "@/lib/raw-video";
import { downloadMacosPackageZipStreaming } from "@/lib/macos-package-zip-download";
import { parseMacosPackageIdFromSyntheticFileId } from "@/lib/macos-package-synthetic-id";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";
import {
  recentFileToCreativeThumbnailSource,
  resolveCreativeProjectTile,
} from "@/lib/creative-project-thumbnail";
import { BrandedProjectTile } from "@/components/files/BrandedProjectTile";
import {
  filePreviewForceProxyMp4,
  filePreviewLutDebugEnabled,
} from "@/lib/file-preview-lut-debug";
import { usePdfBlobUrl } from "@/hooks/usePdfBlobUrl";
import {
  CREATOR_RAW_PORTRAIT_STAGE,
  CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE,
  fileNameSuggestsPortraitReel,
  parsePortraitDimensionsFromFileName,
  resolveCreatorRawReelPortrait,
  type CreatorRawReelEvidence,
} from "@/lib/creator-raw-reel-presentation";
import { creatorRawUsesProxyOnlyPlayback } from "@/lib/creator-raw-preview-contract";

const AUDIO_EXT = /\.(mp3|wav|ogg|m4a|aac|flac)$/i;
const PDF_EXT = /\.pdf$/i;

function getPreviewType(
  name: string,
  contentType?: string | null,
  assetType?: string | null,
  mediaType?: string | null
): "image" | "video" | "audio" | "pdf" | "project_file" | "other" {
  if (assetType === "project_file" || isProjectFile(name)) return "project_file";
  const lower = name.toLowerCase();
  /** Cinema RAW + all backup video extensions — must win before still-RAW / image (see raw-video.ts). */
  if (shouldUseVideoThumbnailPipeline(name) || mediaType === "video") return "video";
  if (GALLERY_IMAGE_EXT.test(lower)) return "image";
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

function clampImageZoom(z: number): number {
  return Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
}

/** Soft blurred frame behind the 9:16 reel so dead space feels intentional (streaming-thumb based). */
function CreatorReelAmbientBackdrop({
  thumbUrl,
  immersiveLightChrome,
}: {
  thumbUrl: string | null;
  immersiveLightChrome: boolean;
}) {
  if (!thumbUrl) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-[-8%] inset-y-[-12%] -z-10 overflow-hidden rounded-[2.75rem]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- thumb API URL */}
      <img
        src={thumbUrl}
        alt=""
        className="h-full min-h-[125%] w-full min-w-[125%] -translate-y-[4%] scale-110 object-cover opacity-[0.4] blur-[48px] saturate-[1.3] dark:opacity-[0.34]"
      />
      <div
        className={
          immersiveLightChrome
            ? "absolute inset-0 bg-gradient-to-b from-white/[0.2] via-sky-50/[0.08] to-slate-800/[0.16]"
            : "absolute inset-0 bg-gradient-to-b from-slate-950/50 via-transparent to-black/5"
        }
      />
    </div>
  );
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
  const theme = useThemeResolved();
  const immersiveLightChrome = theme === "light";
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoProcessing, setVideoProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lutEnabled, setLutEnabled] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [videoMediaVisible, setVideoMediaVisible] = useState(false);
  const [pdfFrameVisible, setPdfFrameVisible] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const imageZoomHostRef = useRef<HTMLDivElement | null>(null);
  const [streamProbeDims, setStreamProbeDims] = useState<{ w: number; h: number } | null>(null);
  const [intrinsicVideoDims, setIntrinsicVideoDims] = useState<{ w: number; h: number } | null>(
    null
  );

  const previewType = file
    ? getPreviewType(file.name, file.contentType, file.assetType, file.mediaType ?? null)
    : "other";
  const hearts = useHearts(file?.id ?? null);
  const pdfEmbed = usePdfBlobUrl(fullUrl, previewType === "pdf");

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

  useEffect(() => {
    setStreamProbeDims(null);
    setIntrinsicVideoDims(null);
  }, [file?.id]);

  /** Portrait reel chrome (16:9 hero + contain) for every workspace; LUT stays behind `showLUT` only. */
  const immersiveReelPortrait = useMemo(() => {
    if (!file || previewType !== "video") return false;
    const evidences: CreatorRawReelEvidence[] = [];
    const rw0 = file.resolution_w ?? file.width ?? null;
    const rh0 = file.resolution_h ?? file.height ?? null;
    if (rw0 != null && rh0 != null && rw0 > 0 && rh0 > 0) {
      evidences.push({ source: "firestore", width: rw0, height: rh0 });
    }
    const fromName = parsePortraitDimensionsFromFileName(file.name);
    if (fromName) evidences.push({ source: "filename", width: fromName.width, height: fromName.height });
    if (fileNameSuggestsPortraitReel(file.name) && !fromName && rw0 == null && rh0 == null) {
      evidences.push({ source: "filename", width: 9, height: 16 });
    }
    if (streamProbeDims) {
      evidences.push({
        source: "stream_api",
        width: streamProbeDims.w,
        height: streamProbeDims.h,
      });
    }
    if (intrinsicVideoDims) {
      evidences.push({
        source: "video_element",
        width: intrinsicVideoDims.w,
        height: intrinsicVideoDims.h,
      });
    }
    return resolveCreatorRawReelPortrait(evidences);
  }, [file, previewType, streamProbeDims, intrinsicVideoDims]);

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
        if (showLUTForVideo) {
          setFullUrl(null);
          const streamRes = await fetch("/api/backup/video-stream-url", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload),
          });
          const streamData = (await streamRes.json().catch(() => ({}))) as {
            streamUrl?: string;
            processing?: boolean;
            error?: string;
            proxyUnavailable?: boolean;
            message?: string;
            resolution_w?: number;
            resolution_h?: number;
          };
          if (!streamRes.ok) {
            throw new Error(
              typeof streamData?.error === "string" && streamData.error.trim()
                ? streamData.error
                : "Failed to load preview stream"
            );
          }
          if (streamData.proxyUnavailable) {
            setVideoProcessing(false);
            setError(
              typeof streamData.message === "string" && streamData.message.trim()
                ? streamData.message
                : "Cloud preview isn’t available for this file. Use Download for the original."
            );
            return;
          }
          if (
            typeof streamData.resolution_w === "number" &&
            typeof streamData.resolution_h === "number" &&
            streamData.resolution_w > 0 &&
            streamData.resolution_h > 0
          ) {
            setStreamProbeDims({ w: streamData.resolution_w, h: streamData.resolution_h });
          }
          if (streamData.streamUrl) {
            setVideoStreamUrl(streamData.streamUrl);
            setVideoProcessing(false);
          } else if (streamData.processing) {
            setVideoProcessing(true);
          } else {
            setVideoProcessing(true);
          }
        } else {
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
        }
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
  }, [file?.objectKey, previewType, showLUTForVideo]);

  useEffect(() => {
    setImageZoom(1);
  }, [file?.id, previewType]);

  useEffect(() => {
    setVideoMediaVisible(false);
    setPdfFrameVisible(false);
    setAudioReady(false);
  }, [file?.id]);

  useEffect(() => {
    setPdfFrameVisible(false);
  }, [pdfEmbed.blobUrl]);

  useEffect(() => {
    const el = imageZoomHostRef.current;
    if (!el || previewType !== "image" || !lowResPreviewUrl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setImageZoom((z) => clampImageZoom(z + (e.deltaY > 0 ? -0.15 : 0.15)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [previewType, lowResPreviewUrl, file?.id]);

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
    const intervalMs = showLUTForVideo ? 4000 : 6000;
    const interval = setInterval(async () => {
      pollCount += 1;
      try {
        const t = await token.getIdToken(true);
        const res = await fetch("/api/backup/video-stream-url", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
          body: JSON.stringify({ object_key: file.objectKey, user_id: token.uid }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          streamUrl?: string;
          processing?: boolean;
          proxyUnavailable?: boolean;
          message?: string;
          resolution_w?: number;
          resolution_h?: number;
        };
        if (data?.proxyUnavailable) {
          setVideoProcessing(false);
          setError(
            typeof data.message === "string" && data.message.trim()
              ? data.message
              : "Cloud preview isn’t available for this file. Use Download for the original."
          );
          return;
        }
        if (
          typeof data.resolution_w === "number" &&
          typeof data.resolution_h === "number" &&
          data.resolution_w > 0 &&
          data.resolution_h > 0
        ) {
          setStreamProbeDims({ w: data.resolution_w, h: data.resolution_h });
        }
        if (data?.streamUrl) {
          setVideoStreamUrl(data.streamUrl);
          setVideoProcessing(false);
        } else if (!data?.processing && res.ok) {
          if (!showLUTForVideo) setVideoProcessing(false);
        } else if (!showLUTForVideo && fullUrl && pollCount >= 10) {
          // Non–Creator RAW: after ~60s fall back to preview-url (proxy or original)
          setVideoProcessing(false);
        }
      } catch {
        // ignore polling errors
      }
    }, intervalMs);
    return () => clearInterval(interval);
  }, [file?.objectKey, previewType, videoProcessing, fullUrl, showLUTForVideo]);


  const handleDownload = useCallback(async () => {
    if (!file) return;
    const pkgFromRow = file.macosPackageId?.startsWith("pkg_") ? file.macosPackageId : null;
    const pkgFromId = parseMacosPackageIdFromSyntheticFileId(file.id);
    const packageId = pkgFromRow ?? pkgFromId ?? null;
    if (packageId?.startsWith("pkg_")) {
      setDownloading(true);
      setError(null);
      try {
        await downloadMacosPackageZipStreaming(packageId);
      } catch (err) {
        console.error("Download error:", err);
        setError(err instanceof Error ? err.message : "Download failed");
      } finally {
        setDownloading(false);
      }
      return;
    }
    if (!file.objectKey) return;
    setDownloading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }, [file]);

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

  const onIntrinsicVideoSize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) setIntrinsicVideoDims({ w: width, h: height });
  }, []);

  useEffect(() => {
    if (!filePreviewLutDebugEnabled() || !file) return;
    if (getPreviewType(file.name, file.contentType, file.assetType) !== "video") return;
    console.debug("[FilePreviewModal LUT]", {
      fileId: file.id,
      driveId: file.driveId,
      showLUTForVideo,
      lutConfigPresent: lutConfig != null,
      lutLibraryIsNull: lutLibrary === null,
      lutLibraryLength: Array.isArray(lutLibrary) ? lutLibrary.length : null,
      lutOptionsCount: lutOptions.length,
      showLUT,
      lutSourceSample:
        lutSource == null
          ? null
          : lutSource.length > 96
            ? `${lutSource.slice(0, 96)}…`
            : lutSource,
    });
  }, [
    file?.id,
    file?.driveId,
    file?.name,
    file?.contentType,
    file?.assetType,
    showLUTForVideo,
    lutConfig,
    lutLibrary,
    lutOptions.length,
    showLUT,
    lutSource,
  ]);

  if (!file) return null;

  const fpCreative = resolveCreativeProjectTile(recentFileToCreativeThumbnailSource(file));
  const immersivePortraitStage = previewType === "video" && immersiveReelPortrait;
  const proxyOnlyPlayback = creatorRawUsesProxyOnlyPlayback(showLUTForVideo, previewType === "video");
  /** 16:9 framed hero: all non–Creator-RAW videos + portrait reels. Skip when LUT toolbar sits beside video (landscape RAW). */
  const immersiveVideoFramedSlot = previewType === "video" && (immersivePortraitStage || !showLUT);

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
          immersiveDark={!immersiveLightChrome}
          immersiveLightChrome={immersiveLightChrome}
        />
      ) : null}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className={
          immersiveLightChrome
            ? "touch-target-sm rounded-none p-2 text-neutral-800 transition-colors hover:bg-neutral-900/10 hover:text-bizzi-blue disabled:opacity-50"
            : "touch-target-sm rounded-none p-2 text-white/85 transition-colors hover:bg-white/10 hover:text-bizzi-cyan disabled:opacity-50"
        }
        aria-label="Download full resolution"
      >
        <Download className="h-4 w-4" />
      </button>
    </>
  );

  let mediaBody: ReactNode = null;
  let mediaFooter: ReactNode = null;

  if (error) {
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
    previewType === "video" &&
    !error &&
    (videoProcessing ||
      (showLUTForVideo && loading) ||
      (!showLUTForVideo && loading && !fullUrl))
  ) {
    if (immersivePortraitStage) {
      mediaBody = (
        <div
          className={`flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center transition-opacity duration-300 ${CREATOR_RAW_PORTRAIT_STAGE.shellPadX} ${CREATOR_RAW_PORTRAIT_STAGE.shellPadY}`}
        >
          <div
            className={`relative isolate flex w-full flex-col items-center justify-center ${CREATOR_RAW_PORTRAIT_STAGE.stageMaxWidthClass} ${CREATOR_RAW_PORTRAIT_STAGE.lutRailGap}`}
          >
            <CreatorReelAmbientBackdrop
              thumbUrl={lowResPreviewUrl}
              immersiveLightChrome={immersiveLightChrome}
            />
            <div
              className={CREATOR_RAW_PORTRAIT_STAGE.processingShellClass}
              style={CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE}
            >
              <p className="max-w-[14rem] text-center text-xs leading-relaxed text-neutral-200 sm:text-sm">
                {showLUTForVideo ? (
                  <>
                    Creating a lightweight streaming proxy.{" "}
                    <span className="font-semibold text-white">Originals are never played here</span> — use
                    Download for the camera file.
                  </>
                ) : (
                  <>
                    Preparing streaming preview.{" "}
                    <span className="font-semibold text-white">Hang tight</span> — playback will start when the
                    proxy is ready. Use Download for the original file.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      );
    } else {
      const waitTextClass = immersiveLightChrome
        ? "text-neutral-800"
        : "text-neutral-100";
      const waitMutedClass = immersiveLightChrome ? "text-neutral-600" : "text-neutral-300";
      mediaBody = (
        <div className="flex min-h-[12rem] w-full flex-1 flex-col items-center justify-center gap-4 px-4 py-8 md:px-8">
          {lowResPreviewUrl ? (
            <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-black/10 bg-black/30 shadow-xl dark:border-white/15">
              {/* eslint-disable-next-line @next/next/no-img-element -- thumb API URL */}
              <img
                src={lowResPreviewUrl}
                alt=""
                className="mx-auto max-h-[min(38dvh,320px)] w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/55 to-transparent dark:from-black/70" />
            </div>
          ) : null}
          <p className={`max-w-lg text-center text-sm leading-relaxed ${waitTextClass}`}>
            {showLUTForVideo ? (
              <>
                Creating a lightweight streaming proxy for preview.{" "}
                <span className={`font-medium ${immersiveLightChrome ? "text-neutral-900" : "text-white"}`}>
                  Full-resolution originals are not played in this viewer
                </span>{" "}
                <span className={waitMutedClass}>— use Download for the camera file.</span>
              </>
            ) : (
              <>
                Preparing preview playback.{" "}
                <span className={`font-medium ${immersiveLightChrome ? "text-neutral-900" : "text-white"}`}>
                  Streaming quality may differ from the downloaded file
                </span>
                .
              </>
            )}
          </p>
        </div>
      );
    }
  } else if (previewType === "pdf" && fullUrl && pdfEmbed.failed) {
    mediaBody = (
      <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 text-red-600 dark:text-red-400">
        <FileIcon className="h-12 w-12" />
        <p className="text-sm">Could not load PDF preview</p>
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
    (loading && !(previewType === "image" && lowResPreviewUrl)) ||
    (previewType === "pdf" &&
      fullUrl &&
      (pdfEmbed.loading || (!pdfEmbed.blobUrl && !pdfEmbed.failed)))
  ) {
    mediaBody = (
      <div
        className="flex min-h-[12rem] w-full flex-1 items-center justify-center"
        aria-hidden
      />
    );
  } else if (
    (previewType === "image" && lowResPreviewUrl) ||
    (previewType === "video" &&
      !videoProcessing &&
      (showLUTForVideo ? !!videoStreamUrl : !!fullUrl)) ||
    previewType === "project_file" ||
    ((previewType === "audio" || previewType === "other") && fullUrl) ||
    (previewType === "pdf" && fullUrl && !!pdfEmbed.blobUrl)
  ) {
    if (previewType === "image" && lowResPreviewUrl) {
      mediaBody = (
        <div
          ref={imageZoomHostRef}
          className="relative flex h-full min-h-0 w-full max-w-full flex-1 flex-col items-center justify-center"
        >
          <div className="flex max-h-[min(86dvh,calc(100dvh-7rem))] min-h-0 w-full flex-1 items-center justify-center overflow-auto">
            <div
              className="inline-flex origin-center transition-transform duration-150 ease-out"
              style={{
                transform: `scale(${imageZoom})`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API */}
              <img
                src={lowResPreviewUrl}
                alt={file.name}
                className="max-h-[min(82dvh,calc(100dvh-8rem))] max-w-[min(92vw,100%)] rounded-md object-contain shadow-md shadow-black/15 dark:shadow-black/35"
              />
            </div>
          </div>
          <div className="pointer-events-auto absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-neutral-200/90 bg-neutral-900/88 px-1.5 py-1 shadow-xl backdrop-blur-md dark:border-white/20 dark:bg-black/85 sm:bottom-4">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/95 transition-colors hover:bg-white/15"
              aria-label="Zoom out"
              onClick={() => setImageZoom((z) => clampImageZoom(z - 0.25))}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="min-w-[3.25rem] rounded-lg px-2 py-1 text-center text-xs font-medium tabular-nums text-white/90 hover:bg-white/10"
              onClick={() => setImageZoom(1)}
            >
              {Math.round(imageZoom * 100)}%
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/95 transition-colors hover:bg-white/15"
              aria-label="Zoom in"
              onClick={() => setImageZoom((z) => clampImageZoom(z + 0.25))}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
      mediaFooter = (
        <p className="mt-3 text-center text-xs text-neutral-600 dark:text-neutral-400">
          Low-resolution preview · Use Download for full quality
        </p>
      );
    } else if (
      previewType === "video" &&
      (showLUTForVideo ? !!videoStreamUrl : !!fullUrl)
    ) {
      const videoSrc = showLUTForVideo ? (videoStreamUrl ?? "") : (fullUrl as string);
      const effectiveStream =
        showLUTForVideo ? videoStreamUrl : filePreviewForceProxyMp4() ? null : videoStreamUrl;
      mediaBody = (
        <div
          className={`flex h-full min-h-0 w-full max-w-full flex-1 flex-col items-center justify-center transition-opacity duration-300 ease-out ${videoMediaVisible ? "opacity-100" : "opacity-0"} ${immersivePortraitStage ? `${CREATOR_RAW_PORTRAIT_STAGE.shellPadX} ${CREATOR_RAW_PORTRAIT_STAGE.shellPadY}` : "px-3 py-2 md:px-5"}`}
        >
          <div
            className={
              immersivePortraitStage
                ? `relative isolate flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center ${CREATOR_RAW_PORTRAIT_STAGE.stageMaxWidthClass} ${CREATOR_RAW_PORTRAIT_STAGE.lutRailGap}`
                : "relative flex h-full min-h-0 w-full max-w-[min(96rem,100%)] flex-1 flex-col items-center justify-center md:px-2"
            }
          >
            {immersivePortraitStage ? (
              <CreatorReelAmbientBackdrop
                thumbUrl={lowResPreviewUrl}
                immersiveLightChrome={immersiveLightChrome}
              />
            ) : null}
            <div
              className={
                immersivePortraitStage
                  ? "flex w-full flex-1 flex-col items-stretch justify-center"
                  : "flex w-full flex-1 flex-col items-center justify-center"
              }
            >
              {immersiveVideoFramedSlot ? (
                <div
                  className={CREATOR_RAW_PORTRAIT_STAGE.frameShellClass}
                  style={CREATOR_RAW_PORTRAIT_STAGE_SLOT_STYLE}
                >
                  <VideoWithLUT
                    key={file.id ? `file-preview-video:${file.id}` : "file-preview-video"}
                    src={videoSrc}
                    streamUrl={effectiveStream}
                    className={
                      immersivePortraitStage
                        ? "h-full min-h-0 w-full max-h-full !max-h-none"
                        : "h-full min-h-0 w-full max-h-[min(85dvh,calc(100dvh-10rem))]"
                    }
                    showLUTOption={showLUT}
                    lutSource={lutSource}
                    lutOptions={lutOptions}
                    onLutChange={setLutEnabled}
                    frameless
                    sideBySideLut={false}
                    videoObjectFit="contain"
                    onDisplayReady={() => setVideoMediaVisible(true)}
                    preferMaxHlsQuality={!!effectiveStream?.includes(".m3u8")}
                    proxyOnlyPlayback={proxyOnlyPlayback}
                    onIntrinsicVideoSize={onIntrinsicVideoSize}
                  />
                </div>
              ) : (
                <VideoWithLUT
                  key={file.id ? `file-preview-video:${file.id}` : "file-preview-video"}
                  src={videoSrc}
                  streamUrl={effectiveStream}
                  className={"max-h-[min(85dvh,calc(100dvh-10rem))]"}
                  showLUTOption={showLUT}
                  lutSource={lutSource}
                  lutOptions={lutOptions}
                  onLutChange={setLutEnabled}
                  frameless
                  sideBySideLut
                  videoObjectFit="contain"
                  onDisplayReady={() => setVideoMediaVisible(true)}
                  preferMaxHlsQuality={!!effectiveStream?.includes(".m3u8")}
                  proxyOnlyPlayback={proxyOnlyPlayback}
                  onIntrinsicVideoSize={onIntrinsicVideoSize}
                />
              )}
            </div>
          </div>
        </div>
      );
    } else if (previewType === "audio" && fullUrl) {
      mediaBody = (
        <div
          className={`w-full max-w-md rounded-lg border border-neutral-200/80 bg-white/90 p-4 shadow-sm transition-opacity duration-300 ease-out dark:border-neutral-600/50 dark:bg-neutral-900/75 ${audioReady ? "opacity-100" : "opacity-0"}`}
        >
          <audio
            src={fullUrl}
            controls
            className="w-full"
            onLoadedData={() => setAudioReady(true)}
            onCanPlay={() => setAudioReady(true)}
          />
        </div>
      );
    } else if (previewType === "pdf" && fullUrl && pdfEmbed.blobUrl) {
      mediaBody = (
        <div
          className={`flex h-[min(88dvh,calc(100dvh-5.5rem))] w-full max-w-[min(56rem,96vw)] min-h-[320px] flex-col overflow-hidden rounded-lg border border-neutral-300/50 bg-neutral-100/25 shadow-lg transition-opacity duration-300 ease-out dark:border-neutral-600/40 dark:bg-neutral-950/50 ${pdfFrameVisible ? "opacity-100" : "opacity-0"}`}
        >
          <iframe
            src={pdfEmbed.blobUrl}
            title={file.name}
            onLoad={() => setPdfFrameVisible(true)}
            className="h-full min-h-[480px] w-full flex-1 border-0 bg-white dark:bg-neutral-950"
          />
        </div>
      );
    } else if (previewType === "project_file") {
      mediaBody = (
        <div className="flex max-w-md flex-col items-center gap-4 px-4 text-center text-neutral-600 dark:text-neutral-300">
          {fpCreative.mode === "branded_project" ? (
            <div className="h-52 w-full max-w-[14rem]">
              <BrandedProjectTile
                brandId={fpCreative.brandId}
                tileVariant={fpCreative.tileVariant}
                fileName={file.name}
                displayLabel={fpCreative.displayLabel}
                extensionLabel={fpCreative.extensionLabel}
                size="xl"
                className="h-full w-full"
              />
            </div>
          ) : (
            <FolderInput className="h-16 w-16 text-bizzi-blue" />
          )}
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
      splitLayoutGapClassName={
        previewType === "video" && immersivePortraitStage ? "lg:gap-2.5 xl:gap-3" : undefined
      }
      leftStageClassName={
        previewType === "video"
          ? `creator-reel-stage lg:justify-center ${immersivePortraitStage ? "md:py-1" : ""}`
          : undefined
      }
      rightRail={
        file.id ? (
          <div className="flex h-full min-h-0 flex-col">
            <FileCommentsPanel fileId={file.id} immersiveChrome />
          </div>
        ) : null
      }
    />
  );
}
