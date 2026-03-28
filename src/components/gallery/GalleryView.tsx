"use client";

import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import {
  Lock,
  Mail,
  Download,
  Heart,
  Play,
  Film,
  Image as ImageIcon,
  ChevronLeft,
  MessageCircle,
  Music2,
  ExternalLink,
  Palette,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGalleryBulkDownload } from "@/hooks/useGalleryBulkDownload";
import { getGalleryBackgroundTheme } from "@/lib/gallery-background-themes";
import GalleryCoverHero from "@/components/gallery/GalleryCoverHero";
import {
  resolveCoverHeroPreset,
  resolveCoverObjectPosition,
} from "@/lib/gallery-cover-display";
import ImageWithLUT from "./ImageWithLUT";
import VideoWithLUT from "@/components/dashboard/VideoWithLUT";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import LoopingVideoPreview from "@/components/LoopingVideoPreview";
import {
  buildGalleryLUTOptions,
  GALLERY_LUT_ORIGINAL_ID,
  resolveGalleryClientLutSource,
} from "@/lib/gallery-client-lut";
import {
  getGalleryViewerLutPreferencesResolved,
  persistGalleryViewerLutContinuity,
  readGalleryViewerLutContinuityHydration,
  readGalleryViewerLutMixInitial,
} from "@/lib/gallery-viewer-lut-state";
import type { GalleryViewerLutPreferences } from "@/types/gallery-viewer-lut";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import { videoGalleryAllowsClientFileDownloads } from "@/lib/gallery-video-download-policy";
import { isGalleryPreviewUnavailableResponse } from "@/lib/gallery-preview-headers";
import { isRawFile } from "@/lib/gallery-file-types";
import RawPreviewPlaceholder from "@/components/gallery/RawPreviewPlaceholder";
import ImmersiveFilePreviewShell from "@/components/preview/ImmersiveFilePreviewShell";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";

interface GalleryData {
  id: string;
  gallery_type?: "photo" | "video";
  media_mode?: "final" | "raw";
  allow_comments?: boolean;
  allow_favorites?: boolean;
  download_policy?: string;
  invoice_required_for_download?: boolean;
  invoice_status?: string;
  invoice_url?: string | null;
  invoice_label?: string | null;
  featured_video_asset_id?: string | null;
  title: string;
  slug: string;
  description?: string | null;
  event_date?: string | null;
  layout: string;
  access_mode?: string;
  branding: {
    logo_url?: string | null;
    business_name?: string | null;
    accent_color?: string | null;
    background_theme?: string | null;
    welcome_message?: string | null;
    pre_page_music_url?: string | null;
    pre_page_instructions?: string | null;
  };
  download_settings: {
    allow_single_download?: boolean;
    allow_full_gallery_download?: boolean;
    allow_selected_download?: boolean;
    free_download_limit?: number | null;
  };
  watermark: {
    enabled?: boolean;
    image_url?: string | null;
    position?: string | null;
    opacity?: number | null;
  };
  lut?: { enabled?: boolean; lut_source?: string | null; storage_url?: string | null } | null;
  creative_lut_config?: { enabled?: boolean; selected_lut_id?: string | null } | null;
  creative_lut_library?: Array<{ id: string; name?: string; signed_url?: string | null }>;
  /** Future: DB-backed prefs — see `getGalleryViewerLutPreferencesResolved`. */
  viewer_lut_preferences?: GalleryViewerLutPreferences | null;
  /** Legacy; normalized into media_mode on the server — kept for client-side mode checks */
  source_format?: "raw" | "jpg" | null;
  cover_asset_id?: string | null;
  cover_position?: string | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  cover_alt_text?: string | null;
  cover_overlay_opacity?: number | null;
  cover_title_alignment?: "left" | "center" | "right" | null;
  cover_hero_height?: "small" | "medium" | "large" | "cinematic" | "fullscreen" | null;
}

interface GalleryAsset {
  id: string;
  name: string;
  object_key: string;
  media_type: "image" | "video";
  sort_order: number;
  collection_id?: string | null;
}

interface GalleryCollection {
  id: string;
  gallery_id: string;
  title: string;
  sort_order: number;
}

import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";

function WatermarkOverlay({
  imageUrl,
  position = "bottom-right",
  opacity = 50,
  className = "",
}: {
  imageUrl: string;
  position?: string;
  opacity?: number;
  className?: string;
}) {
  const posClass =
    position === "center"
      ? "inset-0"
      : position === "top-left"
        ? "left-2 top-2"
        : position === "top-right"
          ? "right-2 top-2"
          : position === "bottom-left"
            ? "bottom-2 left-2"
            : "bottom-2 right-2";
  return (
    <div
      className={`pointer-events-none absolute ${posClass} flex items-center justify-center ${className}`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt=""
        className="max-h-[25%] max-w-[35%] object-contain"
        style={{ opacity: Math.max(0, Math.min(100, opacity ?? 50)) / 100 }}
      />
    </div>
  );
}

function SaveFavoritesModal({
  count,
  galleryId,
  password,
  onSave,
  onClose,
}: {
  count: number;
  galleryId: string;
  password?: string;
  onSave: (email: string, name: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedListId, setSavedListId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    savedListId &&
    (() => {
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const path = `/g/${galleryId}/favorites/${savedListId}`;
      const params = password ? `?password=${encodeURIComponent(password)}` : "";
      return `${base}${path}${params}`;
    })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const listId = await onSave(email.trim(), name.trim());
      if (listId) setSavedListId(listId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      setError("Copy failed");
    }
  };

  const handleEmailLink = () => {
    if (!shareUrl) return;
    const subject = encodeURIComponent("My favorite photos from the gallery");
    const body = encodeURIComponent(
      `Here's a link to view and download my favorite photos:\n\n${shareUrl}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const modal =
    savedListId && shareUrl ? (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Favorites saved
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Share this link to view and download your favorites.
          </p>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 truncate rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <button
              type="button"
              onClick={handleEmailLink}
              className="flex items-center justify-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              <Mail className="h-4 w-4" />
              Email me this link
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 dark:border-neutral-700 dark:text-neutral-400"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    ) : (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          Save favorites list
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {count} photo{count !== 1 ? "s" : ""} selected. Add your details to save.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Your name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save list"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

function PreviewModal({
  asset,
  previewImageUrl,
  previewImageRawUnavailable: previewRawUnavailableProp = false,
  isVideo,
  comments,
  onClose,
  onAddComment,
  password,
  galleryId,
  getAuthToken,
  watermark,
  lut,
  creativeLutLibrary,
  lutOptions = [],
  selectedLutId,
  onLutSelect,
  lutPreviewEnabled = false,
  onLutPreviewToggle,
  allowComments = true,
  previewLutSource,
  lutGradeMixPercent = 100,
  onLutGradeMixChange,
}: {
  asset: GalleryAsset;
  previewImageUrl: string | null;
  /** True when RAW thumbnail API could not produce a raster (show placeholder, not LUT) */
  previewImageRawUnavailable?: boolean;
  isVideo: boolean;
  comments: { id: string; body: string; client_name?: string | null; created_at: string }[];
  onClose: () => void;
  onAddComment: (body: string, email?: string, name?: string) => Promise<void>;
  password?: string;
  galleryId: string;
  getAuthToken?: () => Promise<string | null>;
  watermark?: { enabled?: boolean; image_url?: string | null; position?: string | null; opacity?: number | null };
  lut?: { enabled?: boolean; lut_source?: string | null; storage_url?: string | null } | null;
  creativeLutLibrary?: Array<{ id: string; name?: string; signed_url?: string | null }>;
  lutOptions?: Array<{ id: string; name: string; source: string }>;
  selectedLutId?: string | null;
  onLutSelect?: (id: string) => void;
  lutPreviewEnabled?: boolean;
  onLutPreviewToggle?: () => void;
  allowComments?: boolean;
  previewLutSource: string | null;
  lutGradeMixPercent?: number;
  onLutGradeMixChange?: (value: number) => void;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVideo || !asset.object_key) return;
    setVideoStreamUrl(null);
    setVideoError(null);
    setVideoLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(`/api/galleries/${galleryId}/video-stream-url`, window.location.origin);
        url.searchParams.set("object_key", asset.object_key);
        url.searchParams.set("name", asset.name);
        if (password) url.searchParams.set("password", password);
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const t = await getAuthToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(url.toString(), { headers });
        const body = await res.json();
        if (cancelled) return;
        if (body.processing) {
          setVideoError(body.message ?? "Video is processing");
          return;
        }
        if (body.streamUrl) {
          setVideoStreamUrl(body.streamUrl);
        } else if (body.error) {
          setVideoError(body.error);
        }
      } catch (e) {
        if (!cancelled) setVideoError(e instanceof Error ? e.message : "Failed to load video");
      } finally {
        if (!cancelled) setVideoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isVideo, asset.object_key, asset.name, galleryId, password, getAuthToken]);

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentBody.trim()) return;
    setSubmitting(true);
    try {
      await onAddComment(commentBody.trim(), commentEmail || undefined, commentName || undefined);
      setCommentBody("");
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const modalLutOptions =
    lutOptions.length > 0
      ? lutOptions
      : lut?.enabled
        ? buildGalleryLUTOptions(creativeLutLibrary, isVideo, password)
        : [];

  const lutSideControls =
    lut?.enabled &&
    (onLutPreviewToggle ||
      (modalLutOptions.length > 1 && onLutSelect) ||
      (!isVideo && onLutGradeMixChange)) ? (
      <div className="flex flex-col gap-4 rounded-xl border border-white/12 bg-black/35 px-4 py-4 text-white shadow-lg backdrop-blur-xl">
        <p className="text-xs font-medium uppercase tracking-wide text-white/55">Color look</p>
        <p className="text-[13px] leading-snug text-white/70">
          Preview a grade on this file. Originals are never modified.
        </p>
        {onLutPreviewToggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={lutPreviewEnabled}
            aria-label={lutPreviewEnabled ? "Turn off color look preview" : "Turn on color look preview"}
            onClick={onLutPreviewToggle}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-left transition-colors ${
              lutPreviewEnabled ? "ring-1 ring-bizzi-cyan/45" : ""
            }`}
          >
            <span className="text-sm font-medium text-white/95">Preview color grade</span>
            <span
              className={`relative inline-flex h-7 w-11 shrink-0 items-center rounded-full transition-colors ${
                lutPreviewEnabled ? "bg-bizzi-cyan" : "bg-white/20"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
                  lutPreviewEnabled ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </span>
          </button>
        ) : null}
        {!isVideo && lutPreviewEnabled && previewLutSource && onLutGradeMixChange ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-white/85">
              <span>Mix</span>
              <span className="tabular-nums text-white/70">{lutGradeMixPercent}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={lutGradeMixPercent}
              onChange={(e) => onLutGradeMixChange(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-bizzi-cyan"
            />
          </div>
        ) : null}
        {modalLutOptions.length > 1 ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-white/75">Look</span>
            <select
              value={selectedLutId ?? GALLERY_LUT_ORIGINAL_ID}
              disabled={!lutPreviewEnabled}
              onChange={(e) => {
                const id = e.target.value;
                if (id) onLutSelect?.(id);
              }}
              className={`w-full rounded-lg border bg-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-bizzi-cyan/40 ${
                lutPreviewEnabled
                  ? "cursor-pointer border-white/25"
                  : "cursor-not-allowed border-white/10 opacity-45"
              }`}
            >
              {modalLutOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    ) : null;

  const mediaCore = isVideo ? (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col items-center justify-center gap-4">
      {videoLoading && <p className="text-sm text-white/80">Loading video…</p>}
      {videoError && <p className="text-sm text-amber-400">{videoError}</p>}
      {videoStreamUrl && !videoError ? (
        lut?.enabled ? (
          <VideoWithLUT
            key={asset.id}
            src={videoStreamUrl}
            streamUrl={videoStreamUrl}
            className=""
            showLUTOption={false}
            lutSource={previewLutSource}
            creativePreviewOn={lutPreviewEnabled}
            frameless
          />
        ) : (
          <div className="flex h-full w-full min-h-0 items-center justify-center">
            <div className="relative mx-auto max-h-full max-w-full overflow-hidden rounded-lg bg-black">
              <video
                src={videoStreamUrl}
                controls
                playsInline
                className="max-h-[min(92dvh,calc(100dvh-6rem))] max-w-full object-contain"
              />
            </div>
          </div>
        )
      ) : null}
      {!videoStreamUrl && !videoLoading && !videoError ? (
        <p className="text-sm text-white/80">Video unavailable</p>
      ) : null}
    </div>
  ) : previewRawUnavailableProp ? (
    <div className="w-full max-w-lg rounded-lg bg-white/[0.06] px-4 py-6">
      <RawPreviewPlaceholder fileName={asset.name} />
    </div>
  ) : previewImageUrl ? (
    <div className="relative flex h-full min-h-0 w-full max-w-full items-center justify-center">
      {lut?.enabled && previewLutSource && isImage(asset.name) && lutPreviewEnabled ? (
        <ImageWithLUT
          key={asset.id}
          imageUrl={previewImageUrl}
          lutUrl={previewLutSource}
          lutEnabled={true}
          className="block max-h-full max-w-full"
          objectFit="contain"
          gradeMixPercent={lutGradeMixPercent}
        />
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewImageUrl}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      )}
      {watermark?.enabled && watermark?.image_url && (
        <WatermarkOverlay
          imageUrl={watermark.image_url}
          position={watermark.position ?? undefined}
          opacity={watermark.opacity ?? 50}
          className="!max-h-[18%] !max-w-[28%]"
        />
      )}
    </div>
  ) : (
    <div className="flex h-64 w-64 items-center justify-center">
      <ImageIcon className="h-16 w-16 animate-pulse text-white/50" />
    </div>
  );

  const commentsRail =
    allowComments ? (
      <div className="space-y-5 text-white/95">
        <h3 className="flex items-center gap-2 text-sm font-medium text-white/90">
          <MessageCircle className="h-4 w-4 shrink-0 opacity-80" />
          Comments
        </h3>
        <div className="space-y-2">
          {comments.length === 0 ? (
            <p className="text-sm text-white/60">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-white/[0.06] px-3 py-2.5 text-sm">
                <p className="font-medium text-white/90">{c.client_name || "Anonymous"}</p>
                <p className="text-white/85">{c.body}</p>
                <p className="mt-1 text-xs text-white/45">
                  {c.created_at
                    ? new Date(c.created_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
              </div>
            ))
          )}
        </div>
        <form onSubmit={handleCommentSubmit} className="space-y-2.5">
          <input
            type="text"
            value={commentName}
            onChange={(e) => setCommentName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-white placeholder-white/45"
          />
          <input
            type="email"
            value={commentEmail}
            onChange={(e) => setCommentEmail(e.target.value)}
            placeholder="Email (optional)"
            className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-white placeholder-white/45"
          />
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            placeholder="Add a comment..."
            rows={3}
            className="w-full rounded-lg border border-white/15 bg-white/[0.07] px-3 py-2 text-sm text-white placeholder-white/45"
          />
          <button
            type="submit"
            disabled={submitting || !commentBody.trim()}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </form>
      </div>
    ) : null;

  return (
    <ImmersiveFilePreviewShell
      variant="gallery"
      onClose={onClose}
      title={asset.name}
      media={mediaCore}
      bottomBar={lutSideControls}
      rightRail={commentsRail}
    />
  );
}

function isImage(name: string) {
  return GALLERY_IMAGE_EXT.test(name);
}
function isVideo(name: string) {
  return GALLERY_VIDEO_EXT.test(name);
}

function GalleryAssetCard({
  galleryId,
  asset,
  password,
  getAuthToken,
  onPreview,
  onDownload,
  onFavoriteToggle,
  isFavorited,
  canDownload,
  downloading,
  masonryLayout,
  watermark,
  lut,
  lutPreviewEnabled = false,
  previewLutSource = null,
  lutGradeMixPercent = 100,
  isFeaturedVideo = false,
  isVideoGallery = false,
}: {
  galleryId: string;
  asset: GalleryAsset;
  password?: string;
  getAuthToken?: () => Promise<string | null>;
  onPreview: () => void;
  onDownload?: () => void;
  onFavoriteToggle: () => void;
  isFavorited: boolean;
  canDownload: boolean;
  downloading: boolean;
  masonryLayout?: boolean;
  watermark?: { enabled?: boolean; image_url?: string | null; position?: string | null; opacity?: number | null };
  lut?: { enabled?: boolean; lut_source?: string | null; storage_url?: string | null } | null;
  lutPreviewEnabled?: boolean;
  /** Resolved client preview LUT (null = Original). */
  previewLutSource?: string | null;
  lutGradeMixPercent?: number;
  isFeaturedVideo?: boolean;
  /** When true, all videos autoplay muted (not just featured) */
  isVideoGallery?: boolean;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [rawThumbUnavailable, setRawThumbUnavailable] = useState(false);
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const isImg = isImage(asset.name);
  const isVid = isVideo(asset.name);
  const shouldAutoplayVideo = isVid && (isFeaturedVideo || isVideoGallery);

  const fetchGalleryVideoStreamUrl = useCallback(async (): Promise<string | null> => {
    try {
      const params = new URLSearchParams({
        object_key: asset.object_key,
        name: asset.name,
      });
      if (password) params.set("password", password);
      const headers: Record<string, string> = {};
      if (getAuthToken) {
        const t = await getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(
        `/api/galleries/${galleryId}/video-stream-url?${params}`,
        { headers }
      );
      if (!res.ok) return null;
      const json = await res.json();
      const url = json?.streamUrl;
      if (!url) return null;
      return url.startsWith("/") ? `${window.location.origin}${url}` : url;
    } catch {
      return null;
    }
  }, [galleryId, asset.object_key, asset.name, password, getAuthToken]);

  // Fetch stream for 5s loop preview tiles (featured or all videos in video gallery)
  useEffect(() => {
    if (!shouldAutoplayVideo) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: asset.object_key,
          name: asset.name,
        });
        if (password) params.set("password", password);
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const t = await getAuthToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(
          `/api/galleries/${galleryId}/video-stream-url?${params}`,
          { headers }
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { streamUrl?: string };
        if (cancelled) return;
        if (json.streamUrl) {
          const url = json.streamUrl as string;
          setVideoStreamUrl(url.startsWith("/") ? `${window.location.origin}${url}` : url);
        } else {
          setVideoStreamUrl(null);
        }
      } catch {
        setVideoStreamUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      setVideoStreamUrl(null);
    };
  }, [shouldAutoplayVideo, galleryId, asset.object_key, asset.name, password, getAuthToken]);

  useEffect(() => {
    if (!isImg && !isVid) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: asset.object_key,
          name: asset.name,
          size: "large",
        });
        if (password) params.set("password", password);
        const headers: Record<string, string> = {};
        if (getAuthToken) {
          const t = await getAuthToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const url = isVid
          ? `/api/galleries/${galleryId}/video-thumbnail?${params}`
          : `/api/galleries/${galleryId}/thumbnail?${params}`;
        const res = await fetch(url, { headers });
        if (!res.ok || cancelled) return;
        if (isImg && isRawFile(asset.name) && isGalleryPreviewUnavailableResponse(res)) {
          if (!cancelled) {
            setRawThumbUnavailable(true);
            setThumbUrl(null);
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setRawThumbUnavailable(false);
        setThumbUrl(blobUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      setRawThumbUnavailable(false);
      setThumbUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, [galleryId, asset.object_key, asset.name, isImg, isVid, password, getAuthToken]);

  const useNaturalAspect = masonryLayout;

  return (
    <div
      className={`group relative cursor-pointer overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 ${masonryLayout ? "mb-3 break-inside-avoid" : ""}`}
      onClick={onPreview}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPreview();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div
        className={`relative w-full ${useNaturalAspect ? "flex" : "aspect-[4/3]"}`}
      >
        {shouldAutoplayVideo && videoStreamUrl ? (
          lut?.enabled && previewLutSource && lutPreviewEnabled ? (
            <VideoWithLUT
              key={asset.id}
              src={videoStreamUrl}
              streamUrl={videoStreamUrl}
              showLUTOption={false}
              lutSource={previewLutSource}
              creativePreviewOn={lutPreviewEnabled}
              compactPreview
              segmentLoopSeconds={5}
              className={`block w-full object-cover ${
                useNaturalAspect ? "h-auto" : "h-full"
              }`}
            />
          ) : (
            <LoopingVideoPreview
              src={videoStreamUrl}
              loopSeconds={5}
              className={`block w-full object-cover ${
                useNaturalAspect ? "h-auto" : "h-full"
              }`}
            />
          )
        ) : isVid ? (
          <div className={`block w-full ${useNaturalAspect ? "h-auto" : "h-full"}`}>
            <VideoScrubThumbnail
              fetchStreamUrl={fetchGalleryVideoStreamUrl}
              thumbnailUrl={thumbUrl}
              showPlayIcon
              className={useNaturalAspect ? "aspect-[4/3]" : "h-full"}
            />
          </div>
        ) : rawThumbUnavailable ? (
          <RawPreviewPlaceholder fileName={asset.name} className="min-h-[140px]" />
        ) : thumbUrl ? (
          lut?.enabled && previewLutSource && lutPreviewEnabled && !rawThumbUnavailable ? (
            <div className={`block w-full transition-transform group-hover:scale-105 ${useNaturalAspect ? "h-auto" : "h-full"}`}>
                <ImageWithLUT
                key={asset.id}
                imageUrl={thumbUrl}
                lutUrl={previewLutSource}
                lutEnabled={true}
                objectFit="cover"
                tileLayout={useNaturalAspect ? "masonry" : "grid"}
                className={`w-full ${useNaturalAspect ? "h-auto" : "h-full"}`}
                gradeMixPercent={lutGradeMixPercent}
              />
            </div>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumbUrl}
              alt=""
              className={`block w-full transition-transform group-hover:scale-105 ${
                useNaturalAspect
                  ? "h-auto object-cover"
                  : "h-full object-cover"
              }`}
            />
          )
        ) : (
          <div className={`flex w-full items-center justify-center ${useNaturalAspect ? "aspect-[4/3] min-h-[120px]" : "h-full"}`}>
            {isVid ? (
              <Film className="h-12 w-12 text-neutral-400" />
            ) : (
              <ImageIcon className="h-12 w-12 text-neutral-400" />
            )}
          </div>
        )}
        {!isVid && watermark?.enabled && watermark?.image_url && (
          <WatermarkOverlay
            imageUrl={watermark.image_url}
            position={watermark.position ?? undefined}
            opacity={watermark.opacity ?? 50}
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onFavoriteToggle();
          }}
          className="absolute left-2 top-2 rounded-full bg-black/50 p-2 text-white transition-opacity hover:bg-black/70"
          aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-5 w-5 ${isFavorited ? "fill-red-500 text-red-500" : ""}`}
          />
        </button>
      </div>
      {canDownload && onDownload && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDownload();
          }}
          disabled={downloading}
          className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-2 text-sm font-medium text-white transition-opacity hover:bg-black/80 disabled:opacity-50"
        >
          <Download className="inline h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function GalleryView({ galleryId }: { galleryId: string }) {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{
    gallery: GalleryData;
    assets: GalleryAsset[];
    collections: GalleryCollection[];
  } | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [previewAsset, setPreviewAsset] = useState<GalleryAsset | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewImageRawUnavailable, setPreviewImageRawUnavailable] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [selectedFavorites, setSelectedFavorites] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = localStorage.getItem(`gallery-favorites-${galleryId}`);
      if (!raw) return new Set();
      const arr = JSON.parse(raw) as string[];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  });
  const [showSaveFavorites, setShowSaveFavorites] = useState(false);
  const [savedFavoritesLists, setSavedFavoritesLists] = useState<
    { id: string; client_name?: string | null; asset_ids: string[]; created_at: string | null }[]
  >([]);
  const [previewComments, setPreviewComments] = useState<
    { id: string; body: string; client_name?: string | null; created_at: string }[]
  >([]);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [featuredVideoStreamUrl, setFeaturedVideoStreamUrl] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [lutPreviewEnabled, setLutPreviewEnabled] = useState(false);
  const [selectedLutId, setSelectedLutId] = useState<string | null>(null);
  const [lutGradeMix, setLutGradeMix] = useState(() => readGalleryViewerLutMixInitial(galleryId));
  const [downloadStatus, setDownloadStatus] = useState<{
    used: number;
    limit: number;
    remaining: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const viewerLutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Last known server prefs; updated on GET and after PATCH without replacing `data` (avoids re-hydration blink). */
  const viewerPrefsFromServerRef = useRef<GalleryViewerLutPreferences | null>(null);

  const scrollToGalleryContent = useCallback(() => {
    setMusicPlaying(false);
    document.getElementById("gallery-content")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const fetchGallery = useCallback(
    async (pwd?: string) => {
      setError(null);
      setErrorCode(null);
      try {
        const url = new URL(`/api/galleries/${galleryId}/view`, window.location.origin);
        if (pwd) url.searchParams.set("password", pwd);
        const headers: Record<string, string> = {};
        if (user) {
          const t = await user.getIdToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(url.toString(), { headers });
        const body = await res.json();
        if (!res.ok) {
          setError(body.message ?? body.error ?? `Failed to load (${res.status})`);
          setErrorCode(body.error ?? body.code ?? null);
          return;
        }
        setData({
          gallery: body.gallery,
          assets: body.assets ?? [],
          collections: body.collections ?? [],
        });
        if (pwd) setPassword(pwd);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [galleryId, user]
  );

  // Wait for auth to finish before first fetch so signed-in invitees get auto-access
  useEffect(() => {
    if (authLoading) return;
    fetchGallery();
  }, [fetchGallery, authLoading]);

  // Retry once when user becomes available after invite_required (handles late auth load)
  const hasRetriedWithAuth = useRef(false);
  useEffect(() => {
    if (
      !authLoading &&
      user &&
      errorCode === "invite_required" &&
      !hasRetriedWithAuth.current
    ) {
      hasRetriedWithAuth.current = true;
      setLoading(true);
      fetchGallery();
    }
  }, [authLoading, user, errorCode, fetchGallery]);

  useEffect(() => {
    if (!data) return;
    viewerPrefsFromServerRef.current = data.gallery.viewer_lut_preferences ?? null;
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const cfg = data.gallery.creative_lut_config;
    const lib = data.gallery.creative_lut_library ?? [];
    const mediaMode = normalizeGalleryMediaMode({
      media_mode: data.gallery.media_mode ?? null,
      source_format: data.gallery.source_format ?? null,
    });
    const lutWorkflowActive = mediaMode === "raw";
    const lutOn = !!data.gallery.lut?.enabled;

    if (!lutWorkflowActive || !lutOn) {
      setLutPreviewEnabled((p) => (p ? false : p));
      return;
    }

    const opts = buildGalleryLUTOptions(
      lib,
      data.gallery.gallery_type === "video",
      password || undefined
    );
    const defaultId =
      cfg?.selected_lut_id && opts.some((o) => o.id === cfg.selected_lut_id)
        ? cfg.selected_lut_id
        : GALLERY_LUT_ORIGINAL_ID;

    const persisted = data.gallery.viewer_lut_preferences;
    const resolved =
      typeof window !== "undefined"
        ? getGalleryViewerLutPreferencesResolved(galleryId, persisted)
        : null;

    /** Opt-in only: off until saved prefs, continuity, or explicit session hints say otherwise (not creator defaults). */
    let nextPreview = false;
    let nextId = defaultId;
    let nextMix: number | undefined;

    if (resolved) {
      nextPreview = lutWorkflowActive && resolved.lutPreviewEnabled;
      if (opts.some((o) => o.id === resolved.selectedLutId)) {
        nextId = resolved.selectedLutId;
      }
      nextMix = resolved.gradeMixPercent;
    } else if (typeof window !== "undefined") {
      try {
        const hints = readGalleryViewerLutContinuityHydration(galleryId);
        if (typeof hints.previewEnabled === "boolean") {
          nextPreview = lutWorkflowActive && hints.previewEnabled;
        }
        if (hints.selectedLutId != null && opts.some((o) => o.id === hints.selectedLutId)) {
          nextId = hints.selectedLutId;
        }
        if (hints.mixPercent !== undefined) {
          nextMix = hints.mixPercent;
        }
      } catch {
        /* ignore */
      }
    }

    setLutPreviewEnabled((p) => (p !== nextPreview ? nextPreview : p));
    setSelectedLutId((p) => (p !== nextId ? nextId : p));
    if (nextMix !== undefined) {
      setLutGradeMix((p) => (p !== nextMix ? nextMix : p));
    }
  }, [data, password, galleryId]);

  useEffect(() => {
    if (!data || selectedLutId === null) return;
    persistGalleryViewerLutContinuity(galleryId, {
      selectedLutId,
      lutPreviewEnabled,
      lutGradeMix,
    });
  }, [galleryId, data, selectedLutId, lutPreviewEnabled, lutGradeMix]);

  /** Debounced save to Firestore; session continuity refreshed after successful PATCH. */
  useEffect(() => {
    if (!data) return;
    const mediaMode = normalizeGalleryMediaMode({
      media_mode: data.gallery.media_mode ?? null,
      source_format: data.gallery.source_format ?? null,
    });
    if (mediaMode !== "raw" || !data.gallery.lut?.enabled) return;
    if (selectedLutId === null) return;

    const next: GalleryViewerLutPreferences = {
      selectedLutId,
      lutPreviewEnabled,
      gradeMixPercent: lutGradeMix,
    };
    const server = viewerPrefsFromServerRef.current;
    if (
      server &&
      server.selectedLutId === next.selectedLutId &&
      server.lutPreviewEnabled === next.lutPreviewEnabled &&
      server.gradeMixPercent === next.gradeMixPercent
    ) {
      return;
    }

    if (viewerLutSaveTimerRef.current) clearTimeout(viewerLutSaveTimerRef.current);
    viewerLutSaveTimerRef.current = setTimeout(() => {
      viewerLutSaveTimerRef.current = null;
      void (async () => {
        try {
          const url = new URL(
            `/api/galleries/${galleryId}/viewer-lut-preferences`,
            window.location.origin
          );
          if (password) url.searchParams.set("password", password);
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (user) {
            const t = await user.getIdToken();
            if (t) headers.Authorization = `Bearer ${t}`;
          }
          const res = await fetch(url.toString(), {
            method: "PATCH",
            headers,
            body: JSON.stringify(next),
          });
          if (!res.ok) return;
          const body = (await res.json()) as { viewer_lut_preferences?: GalleryViewerLutPreferences };
          const saved = body.viewer_lut_preferences;
          if (!saved) return;
          viewerPrefsFromServerRef.current = saved;
          persistGalleryViewerLutContinuity(galleryId, {
            selectedLutId: saved.selectedLutId,
            lutPreviewEnabled: saved.lutPreviewEnabled,
            lutGradeMix: saved.gradeMixPercent,
          });
        } catch {
          /* ignore network errors */
        }
      })();
    }, 500);

    return () => {
      if (viewerLutSaveTimerRef.current) {
        clearTimeout(viewerLutSaveTimerRef.current);
        viewerLutSaveTimerRef.current = null;
      }
    };
  }, [data, galleryId, password, user, selectedLutId, lutPreviewEnabled, lutGradeMix]);

  const fetchDownloadStatus = useCallback(async () => {
    if (!data) return;
    const hasLimit =
      typeof data.gallery.download_settings?.free_download_limit === "number" &&
      data.gallery.download_settings.free_download_limit >= 0;
    if (!hasLimit) return;
    try {
      const statusUrl = new URL(
        `/api/galleries/${galleryId}/download-status`,
        window.location.origin
      );
      if (password) statusUrl.searchParams.set("password", password);
      const headers: Record<string, string> = {};
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(statusUrl.toString(), { headers });
      if (!res.ok) return;
      const body = await res.json();
      if (body.limit != null)
        setDownloadStatus({
          used: body.used ?? 0,
          limit: body.limit,
          remaining: body.remaining ?? Math.max(0, body.limit - (body.used ?? 0)),
        });
    } catch {
      // ignore
    }
  }, [data, galleryId, password, user]);

  useEffect(() => {
    if (!data) return;
    fetchDownloadStatus();
  }, [data, fetchDownloadStatus]);

  useEffect(() => {
    if (!data) return;
    const clientEmail = user?.email?.toLowerCase().trim();
    if (!clientEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const url = new URL(`/api/galleries/${galleryId}/favorites`, window.location.origin);
        url.searchParams.set("client_email", clientEmail);
        if (password) url.searchParams.set("password", password);
        const headers: Record<string, string> = {};
        const t = await (user ? user.getIdToken() : null);
        if (t) headers.Authorization = `Bearer ${t}`;
        const res = await fetch(url.toString(), { headers });
        if (!res.ok || cancelled) return;
        const body = await res.json();
        if (cancelled) return;
        setSavedFavoritesLists(body.lists ?? []);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, galleryId, password, user]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchGallery(passwordInput);
  };

  const {
    download: bulkDownload,
    isLoading: bulkDownloading,
    error: bulkDownloadError,
  } = useGalleryBulkDownload({
    galleryId,
    user: user ?? null,
    password: password || null,
    onComplete: fetchDownloadStatus,
  });

  const getAuthToken = useCallback(
    async () => (user ? user.getIdToken() : null),
    [user]
  );

  useEffect(() => {
    if (!previewAsset || !isImage(previewAsset.name)) {
      setPreviewImageUrl(null);
      setPreviewImageRawUnavailable(false);
      return () => {};
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: previewAsset.object_key,
          name: previewAsset.name,
          size: "large",
        });
        if (password) params.set("password", password);
        const headers: Record<string, string> = {};
        if (user) {
          const t = await user.getIdToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(
          `/api/galleries/${galleryId}/thumbnail?${params}`,
          { headers }
        );
        if (!res.ok || cancelled) return;
        if (isRawFile(previewAsset.name) && isGalleryPreviewUnavailableResponse(res)) {
          if (!cancelled) {
            setPreviewImageRawUnavailable(true);
            setPreviewImageUrl(null);
          }
          return;
        }
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (!cancelled) {
          setPreviewImageRawUnavailable(false);
          setPreviewImageUrl(url);
        } else URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      setPreviewImageUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      setPreviewImageRawUnavailable(false);
    };
  }, [previewAsset, galleryId, password, user]);

  const bannerAsset = data
    ? data.assets.find(
        (a) =>
          a.id === data.gallery.cover_asset_id && isImage(a.name)
      ) ?? data.assets.find((a) => isImage(a.name))
    : null;

  const featuredVideoAsset =
    data?.gallery.gallery_type === "video" && data?.gallery.featured_video_asset_id
      ? data.assets.find(
          (a) => a.id === data.gallery.featured_video_asset_id && isVideo(a.name)
        ) ?? null
      : null;

  useEffect(() => {
    if (!featuredVideoAsset || !data) {
      setFeaturedVideoStreamUrl(null);
      return () => {};
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: featuredVideoAsset.object_key,
          name: featuredVideoAsset.name,
        });
        if (password) params.set("password", password);
        const headers: Record<string, string> = {};
        if (user) {
          const t = await user.getIdToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(
          `/api/galleries/${galleryId}/video-stream-url?${params}`,
          { headers }
        );
        if (!res.ok || cancelled) return;
        const json = (await res.json()) as { streamUrl?: string };
        if (cancelled) return;
        if (json.streamUrl) {
          setFeaturedVideoStreamUrl(json.streamUrl);
        } else {
          setFeaturedVideoStreamUrl(null);
        }
      } catch {
        setFeaturedVideoStreamUrl(null);
      }
    })();
    return () => {
      cancelled = true;
      setFeaturedVideoStreamUrl(null);
    };
  }, [featuredVideoAsset, galleryId, password, user, data]);

  useEffect(() => {
    if (!bannerAsset || !data) {
      setBannerUrl(null);
      return () => {};
    }
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: bannerAsset.object_key,
          name: bannerAsset.name,
          size: "cover-lg",
        });
        if (password) params.set("password", password);
        const headers: Record<string, string> = {};
        if (user) {
          const t = await user.getIdToken();
          if (t) headers.Authorization = `Bearer ${t}`;
        }
        const res = await fetch(
          `/api/galleries/${galleryId}/thumbnail?${params}`,
          { headers }
        );
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (!cancelled) setBannerUrl(url);
        else URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      setBannerUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, [bannerAsset, galleryId, password, user, data]);

  const toggleFavorite = useCallback((assetId: string) => {
    setSelectedFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem(
            `gallery-favorites-${galleryId}`,
            JSON.stringify([...next])
          );
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, [galleryId]);

  const handleSaveFavorites = useCallback(
    async (clientEmail: string, clientName: string): Promise<string | null> => {
      const assetIds = Array.from(selectedFavorites);
      const url = new URL(`/api/galleries/${galleryId}/favorites`, window.location.origin);
      if (password) url.searchParams.set("password", password);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          client_email: clientEmail || null,
          client_name: clientName || null,
          asset_ids: assetIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }
      const data = await res.json();
      const listId = typeof data.id === "string" ? data.id : null;
      setSelectedFavorites(new Set());
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`gallery-favorites-${galleryId}`);
        } catch {
          // ignore
        }
      }
      return listId;
    },
    [galleryId, password, user, selectedFavorites]
  );

  const fetchPreviewComments = useCallback(
    async (assetId: string) => {
      const url = new URL(`/api/galleries/${galleryId}/comments`, window.location.origin);
      url.searchParams.set("asset_id", assetId);
      if (password) url.searchParams.set("password", password);
      const headers: Record<string, string> = {};
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(url.toString(), { headers });
      if (!res.ok) return;
      const data = await res.json();
      setPreviewComments(data.comments ?? []);
    },
    [galleryId, password, user]
  );

  const handleAddComment = useCallback(
    async (assetId: string, body: string, clientEmail?: string, clientName?: string) => {
      const url = new URL(`/api/galleries/${galleryId}/comments`, window.location.origin);
      if (password) url.searchParams.set("password", password);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const res = await fetch(url.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          asset_id: assetId,
          body,
          client_email: clientEmail || null,
          client_name: clientName || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add comment");
      }
      fetchPreviewComments(assetId);
    },
    [galleryId, password, user, fetchPreviewComments]
  );

  const downloadOne = useCallback(
    async (asset: GalleryAsset, context: "single" | "full" | "selected") => {
      setDownloadError(null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const body: Record<string, unknown> = {
        object_key: asset.object_key,
        name: asset.name,
        download_context: context,
      };
      if (password) body.password = password;
      const res = await fetch(`/api/galleries/${galleryId}/download`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === "invoice_required") {
          setDownloadError("Payment required before download.");
          return;
        }
        const msg = json.message ?? json.error ?? "Download failed";
        throw new Error(msg);
      }
      const a = document.createElement("a");
      a.href = json.url?.startsWith("/") ? `${window.location.origin}${json.url}` : json.url;
      a.download = asset.name;
      a.rel = "noopener noreferrer";
      a.click();
      fetchDownloadStatus();
    },
    [galleryId, user, password, fetchDownloadStatus]
  );

  const handleDownload = useCallback(
    async (asset: GalleryAsset) => {
      setDownloadingId(asset.id);
      setDownloadError(null);
      try {
        await downloadOne(asset, "single");
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
      } finally {
        setDownloadingId(null);
      }
    },
    [downloadOne]
  );

  const handleDownloadAll = useCallback(async () => {
    if (!data) return;
    const downloadable = data.assets.filter(
      (a) =>
        a.media_type === "image" ||
        /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic|mp4|webm|mov|m4v)$/i.test(a.name)
    );
    if (downloadable.length === 0) return;
    setDownloadError(null);
    const items = downloadable.map((a) => ({ object_key: a.object_key, name: a.name }));
    await bulkDownload(items, "full");
  }, [data, bulkDownload]);

  const handleDownloadSelected = useCallback(async () => {
    if (!data) return;
    const toDownload = data.assets.filter((a) => selectedFavorites.has(a.id));
    if (toDownload.length === 0) return;
    setDownloadError(null);
    const items = toDownload.map((a) => ({ object_key: a.object_key, name: a.name }));
    await bulkDownload(items, "selected");
  }, [data, selectedFavorites, bulkDownload]);

  const prePageMusicUrlFromData = data?.gallery?.branding?.pre_page_music_url ?? null;
  useEffect(() => {
    if (!audioRef.current || !prePageMusicUrlFromData) return;
    if (musicPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [musicPlaying, prePageMusicUrlFromData]);

  if (loading && !data) {
    return (
      <div className="min-h-[100dvh] bg-neutral-50 dark:bg-neutral-950">
        <DashboardRouteFade
          ready={false}
          srOnlyMessage="Loading gallery"
          placeholderClassName="min-h-[100dvh] rounded-none from-neutral-200/50 via-neutral-100/40 to-transparent dark:from-neutral-800/55 dark:via-neutral-900/35 dark:to-transparent"
        >
          {null}
        </DashboardRouteFade>
      </div>
    );
  }

  if (errorCode === "password_required" || errorCode === "invalid_password") {
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
              {error ?? "Enter the gallery password to view."}
            </p>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Enter password"
              className="w-full rounded-lg border border-neutral-200 px-4 py-3 text-neutral-900 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              autoFocus
            />
            <button
              type="submit"
              className="w-full rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              View gallery
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (errorCode === "invite_required") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Mail className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Invite only
            </h1>
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              Enter your invited email to access this gallery. No sign-up required.
            </p>
          </div>
          <Link
            href={`/client?redirect=${encodeURIComponent(`/g/${galleryId}`)}`}
            className="flex w-full items-center justify-center rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            Enter email to access
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <ImageIcon className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          Gallery not found
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{error}</p>
      </div>
    );
  }

  const { gallery, assets, collections } = data;

  const mediaMode = normalizeGalleryMediaMode({
    media_mode: gallery.media_mode ?? null,
    source_format: gallery.source_format ?? null,
  });
  const lutWorkflowActive = mediaMode === "raw";

  const galleryLutOptions = buildGalleryLUTOptions(
    gallery.creative_lut_library,
    gallery.gallery_type === "video",
    password || undefined
  );
  const clientLutSource = resolveGalleryClientLutSource({
    lutEnabled: lutWorkflowActive && !!gallery.lut?.enabled,
    lutPreviewEnabled,
    selectedLutId,
    options: galleryLutOptions,
    ownerDefaultSource: gallery.lut?.lut_source ?? gallery.lut?.storage_url ?? null,
  });
  /** LUT preview only in RAW galleries; never use for download. Preview URL is clientLutSource. */
  const effectiveLut = lutWorkflowActive && gallery.lut?.enabled ? gallery.lut : null;

  const filteredAssets =
    selectedCollectionId === null
      ? assets
      : assets.filter(
          (a) => (a.collection_id ?? null) === selectedCollectionId
        );
  const accent = gallery.branding.accent_color ?? "#00BFFF";
  const bgTheme = getGalleryBackgroundTheme(gallery.branding.background_theme);
  const isDarkBg = bgTheme.textTone === "light";

  const invoiceBlocksDownload =
    !!(gallery.invoice_required_for_download && gallery.invoice_status !== "paid");
  const videoAllowsFileDownloads =
    gallery.gallery_type !== "video" ||
    videoGalleryAllowsClientFileDownloads(gallery.download_policy);
  const clientMayDownloadFiles = videoAllowsFileDownloads && !invoiceBlocksDownload;

  const coverObjectPosition = resolveCoverObjectPosition({
    cover_focal_x: gallery.cover_focal_x,
    cover_focal_y: gallery.cover_focal_y,
    cover_position: gallery.cover_position,
  });
  const resolvedHeroPreset = resolveCoverHeroPreset(gallery.cover_hero_height);

  const heroImageLutActive =
    lutWorkflowActive &&
    !!gallery.lut?.enabled &&
    lutPreviewEnabled &&
    !!clientLutSource &&
    !!bannerUrl &&
    !featuredVideoStreamUrl;

  const heroVideoLutActive =
    lutWorkflowActive &&
    !!gallery.lut?.enabled &&
    lutPreviewEnabled &&
    !!clientLutSource &&
    !!featuredVideoStreamUrl;

  const heroBackdropStyle: CSSProperties = { objectPosition: coverObjectPosition };

  const prePageMusicUrl = gallery.branding.pre_page_music_url;
  const prePageInstructions = gallery.branding.pre_page_instructions;
  const heroHasMediaBackdrop = !!(bannerUrl || featuredVideoStreamUrl);

  return (
    <DashboardRouteFade ready srOnlyMessage="">
      <div
        className="min-h-screen transition-colors duration-300"
        style={{ backgroundColor: bgTheme.background }}
      >
      <header
        className={`z-30 ${
          heroHasMediaBackdrop
            ? "absolute left-0 right-0 top-0 border-b border-transparent"
            : `relative border-b ${isDarkBg ? "border-white/10" : "border-neutral-200 dark:border-neutral-800"}`
        }`}
        style={{ ["--accent" as string]: accent }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <Link
            href="/"
            className={`flex items-center gap-2 ${
              heroHasMediaBackdrop ? "text-white" : isDarkBg ? "text-white" : "text-neutral-900"
            }`}
          >
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="text-base font-semibold tracking-tight">
              {gallery.branding.business_name || "Bizzi"}
              {gallery.branding.business_name ? "" : " Cloud"}
            </span>
          </Link>
          {prePageMusicUrl && (
            <button
              type="button"
              onClick={() => setMusicPlaying((p) => !p)}
              className={`rounded-full p-2 transition-colors ${
                heroHasMediaBackdrop ? "text-white hover:bg-white/20" : isDarkBg ? "text-white/90 hover:bg-white/10" : "text-neutral-600 hover:bg-neutral-100"
              }`}
              title={musicPlaying ? "Pause music" : "Play music"}
            >
              <Music2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </header>

      {heroHasMediaBackdrop ? (
        <GalleryCoverHero
          sectionId="gallery-hero"
          heightMode={{ kind: "live", preset: resolvedHeroPreset }}
          overlayOpacity={gallery.cover_overlay_opacity}
          overlayMode="solid"
          titleAlignment={gallery.cover_title_alignment ?? "center"}
          typographyScope="responsive"
          media={
            featuredVideoStreamUrl ? (
              heroVideoLutActive ? (
                <VideoWithLUT
                  key="gallery-hero-lut-video"
                  src={featuredVideoStreamUrl}
                  streamUrl={featuredVideoStreamUrl}
                  showLUTOption={false}
                  lutSource={clientLutSource}
                  creativePreviewOn
                  compactPreview
                  segmentLoopSeconds={5}
                  className="h-full w-full object-cover [&_.video-fullscreen-container]:h-full [&_.video-fullscreen-container]:min-h-0"
                  videoStyle={heroBackdropStyle}
                />
              ) : (
                <LoopingVideoPreview
                  src={featuredVideoStreamUrl}
                  loopSeconds={5}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: coverObjectPosition }}
                />
              )
            ) : heroImageLutActive ? (
              <ImageWithLUT
                key="gallery-hero-lut"
                imageUrl={bannerUrl!}
                lutUrl={clientLutSource}
                lutEnabled
                variant="fill"
                objectFit="cover"
                className="h-full w-full min-h-0"
                alt={gallery.cover_alt_text || gallery.title || "Gallery cover"}
                imageStyle={heroBackdropStyle}
                gradeMixPercent={lutGradeMix}
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={bannerUrl!}
                alt={gallery.cover_alt_text || gallery.title || "Gallery cover"}
                className="h-full w-full object-cover"
                style={{ objectPosition: coverObjectPosition }}
              />
            )
          }
          eventDate={gallery.event_date}
          logoUrl={gallery.branding.logo_url ?? null}
          businessName={gallery.branding.business_name ?? null}
          welcomeMessage={gallery.branding.welcome_message ?? null}
          prePageInstructions={prePageInstructions || null}
          galleryTitle={gallery.title}
          accentColor={accent}
          onViewGallery={scrollToGalleryContent}
        />
      ) : (
        <section
          id="gallery-hero"
          className="relative flex min-h-screen flex-col items-center justify-center px-4 py-24 text-center sm:px-6"
          aria-label="Gallery cover"
        >
          <div className="relative z-10 flex flex-col items-center gap-6">
            <div
              className={`rounded-2xl border px-8 py-12 ${
                isDarkBg
                  ? "border-white/20 bg-white/5"
                  : "border-neutral-200 bg-white/80 dark:border-neutral-700 dark:bg-neutral-900/80"
              }`}
            >
              {gallery.event_date && (
                <p
                  className={`mb-2 text-xs font-medium uppercase tracking-widest ${
                    isDarkBg ? "text-white/80" : "text-neutral-500"
                  }`}
                >
                  {new Date(gallery.event_date).toLocaleDateString(undefined, {
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </p>
              )}
              {(gallery.branding.logo_url || gallery.branding.business_name) && (
                <div className="mb-4 flex items-center justify-center gap-2">
                  {gallery.branding.logo_url && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={gallery.branding.logo_url}
                      alt=""
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  <span
                    className={`text-sm font-medium uppercase ${
                      isDarkBg ? "text-white/90" : "text-neutral-600"
                    }`}
                  >
                    {gallery.branding.business_name || ""}
                  </span>
                </div>
              )}
              <h1
                className={`mb-4 text-4xl font-semibold sm:text-5xl ${
                  isDarkBg ? "text-white" : "text-neutral-900"
                }`}
                style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}
              >
                {gallery.title}
              </h1>
              {gallery.branding.welcome_message && (
                <p
                  className={`mx-auto mb-4 max-w-lg ${
                    isDarkBg ? "text-white/90" : "text-neutral-600"
                  }`}
                >
                  {gallery.branding.welcome_message}
                </p>
              )}
              {prePageInstructions && (
                <p
                  className={`mx-auto mb-6 max-w-md text-sm ${
                    isDarkBg ? "text-white/75" : "text-neutral-500"
                  }`}
                >
                  {prePageInstructions}
                </p>
              )}
              <button
                type="button"
                onClick={scrollToGalleryContent}
                className="rounded-xl px-8 py-4 text-lg font-medium text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: accent }}
              >
                View gallery
              </button>
            </div>
          </div>
        </section>
      )}

      {prePageMusicUrl && (
        <audio ref={audioRef} src={prePageMusicUrl} loop playsInline className="hidden" />
      )}

      <main id="gallery-content" className="mx-auto max-w-6xl scroll-mt-4 px-4 py-8 sm:px-6">
        <div className="mb-8 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {gallery.invoice_url &&
              gallery.invoice_status !== "paid" && (
                <a
                  href={gallery.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border-2 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                  style={{ borderColor: accent, color: accent }}
                >
                  <ExternalLink className="h-4 w-4" />
                  {gallery.invoice_label || "Pay Invoice"}
                </a>
              )}
            {gallery.download_settings?.allow_full_gallery_download &&
              assets.length > 0 &&
              clientMayDownloadFiles && (
                <button
                  type="button"
                  onClick={handleDownloadAll}
                  disabled={bulkDownloading}
                  className="flex items-center gap-2 rounded-lg border-2 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ borderColor: accent, color: accent }}
                >
                  <Download className="h-4 w-4" />
                  {bulkDownloading ? "Downloading…" : "Download all"}
                </button>
              )}
          </div>
          {(bulkDownloadError ?? downloadError) && (
            <div className="mx-auto mb-4 max-w-xl rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {bulkDownloadError ?? downloadError}
              {gallery.invoice_url && gallery.invoice_status !== "paid" && (
                <a
                  href={gallery.invoice_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-1 font-medium underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {gallery.invoice_label || "Pay Invoice"}
                </a>
              )}
            </div>
          )}
          {downloadStatus && (
            <p
              className={`mx-auto mb-4 text-sm ${
                downloadStatus.remaining === 0
                  ? "text-amber-600 dark:text-amber-400"
                  : isDarkBg
                    ? "text-white/70"
                    : "text-neutral-600 dark:text-neutral-400"
              }`}
            >
              {downloadStatus.remaining === 0 ? (
                <>Download limit reached ({downloadStatus.used} of {downloadStatus.limit} used).</>
              ) : (
                <>{downloadStatus.remaining} of {downloadStatus.limit} downloads remaining.</>
              )}
            </p>
          )}
          {savedFavoritesLists.length > 0 && (
            <div
              className={`mx-auto mb-6 max-w-2xl rounded-xl border px-4 py-3 ${
                isDarkBg
                  ? "border-white/20 bg-white/5"
                  : "border-neutral-200 bg-white/80 dark:border-neutral-700 dark:bg-neutral-900/80"
              }`}
            >
              <h3
                className={`mb-2 text-sm font-medium ${
                  isDarkBg ? "text-white/90" : "text-neutral-700 dark:text-neutral-300"
                }`}
              >
                Your saved favorites lists
              </h3>
              <ul className="space-y-2">
                {savedFavoritesLists.map((list) => (
                  <li
                    key={list.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span
                      className={`text-sm ${
                        isDarkBg ? "text-white/80" : "text-neutral-600 dark:text-neutral-400"
                      }`}
                    >
                      {list.asset_ids.length} photo
                      {list.asset_ids.length !== 1 ? "s" : ""}
                      {list.created_at && (
                        <span className="ml-1 opacity-75">
                          • {new Date(list.created_at).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                    <Link
                      href={`/g/${galleryId}/favorites/${list.id}${
                        password ? `?password=${encodeURIComponent(password)}` : ""
                      }`}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: accent }}
                    >
                      <Download className="h-4 w-4" />
                      View & download
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
            {gallery.description && (
            <p
              className={`mt-4 max-w-2xl mx-auto text-sm ${
                isDarkBg ? "text-white/80" : "text-neutral-600"
              }`}
            >
              {gallery.description}
            </p>
          )}
          <p
            className={`mt-3 text-center text-xs font-medium uppercase tracking-wide ${
              isDarkBg ? "text-white/70" : "text-neutral-500"
            }`}
          >
            {gallery.gallery_type === "video" ? "Video" : "Photo"} ·{" "}
            {mediaMode === "raw" ? "RAW" : "Final"}
          </p>
        </div>

        {collections.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCollectionId(null)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                selectedCollectionId === null
                  ? "text-white"
                  : isDarkBg
                    ? "text-white/70 hover:bg-white/10"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
              }`}
              style={
                selectedCollectionId === null
                  ? { backgroundColor: accent }
                  : undefined
              }
            >
              All
            </button>
            {collections
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => setSelectedCollectionId(col.id)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedCollectionId === col.id
                      ? "text-white"
                      : isDarkBg
                        ? "text-white/70 hover:bg-white/10"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                  style={
                    selectedCollectionId === col.id
                      ? { backgroundColor: accent }
                      : undefined
                  }
                >
                  {col.title}
                </button>
              ))}
          </div>
        )}

        {lutWorkflowActive && gallery.lut?.enabled && (
          <div
            className={`mx-auto mb-6 max-w-2xl rounded-xl border px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5 sm:py-4 ${
              isDarkBg
                ? "border-white/[0.12] bg-white/[0.055] backdrop-blur-md"
                : "border-neutral-200/70 bg-white/[0.92] dark:border-neutral-700/80 dark:bg-neutral-900/75"
            }`}
          >
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-1 gap-2.5 sm:gap-3">
                <div
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isDarkBg ? "bg-white/[0.09] text-white" : "bg-bizzi-blue/[0.09] text-bizzi-blue dark:bg-bizzi-cyan/12 dark:text-bizzi-cyan"
                  }`}
                >
                  <Palette className="h-4 w-4" aria-hidden />
                </div>
                <div className="min-w-0 space-y-1 sm:space-y-1.5">
                  <h3
                    className={`text-[0.9375rem] font-semibold leading-tight tracking-tight ${
                      isDarkBg ? "text-white" : "text-neutral-900 dark:text-white"
                    }`}
                  >
                    Color look preview
                  </h3>
                  <p
                    className={`max-w-prose text-[11px] leading-snug sm:text-xs sm:leading-snug ${
                      isDarkBg ? "text-white/[0.62]" : "text-neutral-500 dark:text-neutral-500"
                    }`}
                  >
                    Turn this on to preview a <strong className="font-medium text-inherit">color grade (LUT)</strong> your
                    creator set up—similar to how the finished photos or video might look after editing. This is{" "}
                    <strong className="font-medium text-inherit">only a preview</strong>; your originals and downloads are
                    unchanged.
                  </p>
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-[15.5rem] sm:items-stretch">
                <button
                  type="button"
                  role="switch"
                  aria-checked={lutPreviewEnabled}
                  aria-label={lutPreviewEnabled ? "Turn off color look preview" : "Turn on color look preview"}
                  onClick={() => setLutPreviewEnabled((p) => !p)}
                  className={`group flex w-full items-center justify-between gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    lutPreviewEnabled
                      ? isDarkBg
                        ? "border-bizzi-cyan/35 bg-bizzi-cyan/[0.11] hover:border-bizzi-cyan/45"
                        : "border-bizzi-blue/35 bg-bizzi-blue/[0.06] hover:border-bizzi-blue/45 dark:border-bizzi-cyan/35 dark:bg-bizzi-cyan/10 dark:hover:border-bizzi-cyan/45"
                      : isDarkBg
                        ? "border-white/[0.14] bg-white/[0.04] hover:border-white/[0.22]"
                        : "border-neutral-200/90 bg-neutral-50/80 hover:border-neutral-300/90 dark:border-neutral-600/75 dark:bg-neutral-800/50 dark:hover:border-neutral-500/80"
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium leading-none ${
                      isDarkBg ? "text-white/95" : "text-neutral-800 dark:text-white/95"
                    }`}
                  >
                    Preview color grade
                  </span>
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                      lutPreviewEnabled
                        ? isDarkBg
                          ? "bg-bizzi-cyan"
                          : "bg-bizzi-blue dark:bg-bizzi-cyan"
                        : isDarkBg
                          ? "bg-white/18"
                          : "bg-neutral-300/90 dark:bg-neutral-600"
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/[0.04] transition-transform duration-200 ease-out dark:ring-white/10 ${
                        lutPreviewEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </span>
                </button>
                {galleryLutOptions.length > 1 && (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="gallery-lut-select"
                      className={`text-[10px] font-medium uppercase tracking-[0.08em] ${
                        isDarkBg ? "text-white/45" : "text-neutral-400 dark:text-neutral-500"
                      }`}
                    >
                      Look
                    </label>
                    <select
                      id="gallery-lut-select"
                      value={selectedLutId ?? GALLERY_LUT_ORIGINAL_ID}
                      disabled={!lutPreviewEnabled}
                      onChange={(e) => {
                        setSelectedLutId(e.target.value);
                      }}
                      className={`w-full appearance-none rounded-lg border bg-[length:0.65rem] bg-[right_0.65rem_center] bg-no-repeat py-2 pl-2.5 pr-8 text-xs font-medium outline-none transition-[border-color,box-shadow] focus:border-bizzi-blue/50 focus:ring-1 focus:ring-bizzi-blue/20 dark:focus:border-bizzi-cyan/45 dark:focus:ring-bizzi-cyan/15 ${
                        lutPreviewEnabled
                          ? isDarkBg
                            ? "border-white/[0.16] bg-white/[0.07] text-white"
                            : "border-neutral-200/90 bg-white text-neutral-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-neutral-600/80 dark:bg-neutral-800/90 dark:text-white dark:shadow-none"
                          : isDarkBg
                            ? "cursor-not-allowed border-white/[0.08] bg-white/[0.03] text-white/35 opacity-70"
                            : "cursor-not-allowed border-neutral-200/70 bg-neutral-100/90 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-600"
                      }`}
                      style={{
                        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(
                          `<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'><path stroke='${
                            !lutPreviewEnabled
                              ? isDarkBg
                                ? "rgba(255,255,255,0.22)"
                                : "rgba(156,163,175,0.85)"
                              : isDarkBg
                                ? "rgba(255,255,255,0.5)"
                                : "rgba(107,114,128,0.9)"
                          }' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/></svg>`
                        )}")`,
                      }}
                    >
                      {galleryLutOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {gallery.gallery_type !== "video" ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <label
                        htmlFor="gallery-lut-mix"
                        className={`text-[10px] font-medium uppercase tracking-[0.08em] ${
                          isDarkBg ? "text-white/45" : "text-neutral-400 dark:text-neutral-500"
                        }`}
                      >
                        Mix
                      </label>
                      <span
                        className={`text-[11px] font-medium tabular-nums ${
                          isDarkBg ? "text-white/70" : "text-neutral-500 dark:text-neutral-400"
                        }`}
                      >
                        {lutGradeMix}
                      </span>
                    </div>
                    <input
                      id="gallery-lut-mix"
                      type="range"
                      min={0}
                      max={100}
                      value={lutGradeMix}
                      disabled={!lutPreviewEnabled || !clientLutSource}
                      onChange={(e) => setLutGradeMix(Number(e.target.value))}
                      className={`h-2 w-full cursor-pointer appearance-none rounded-full accent-bizzi-blue disabled:cursor-not-allowed disabled:opacity-45 dark:accent-bizzi-cyan ${
                        isDarkBg ? "bg-white/15" : "bg-neutral-200/90 dark:bg-neutral-700"
                      }`}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {filteredAssets.length === 0 ? (
          <div
            className={`rounded-xl border py-16 text-center ${
              isDarkBg
                ? "border-white/20 bg-white/5"
                : "border-neutral-200 bg-white/50 dark:border-neutral-700 dark:bg-neutral-900/50"
            }`}
          >
            <ImageIcon
              className={`mx-auto mb-4 h-12 w-12 ${
                isDarkBg ? "text-white/40" : "text-neutral-400"
              }`}
            />
            <p className={isDarkBg ? "text-white/70" : "text-neutral-500"}>
              {selectedCollectionId
                ? "No photos in this collection."
                : "This gallery has no photos or videos yet."}
            </p>
          </div>
        ) : (
          <div
            id="gallery-grid"
            className={
              gallery.layout === "cinematic"
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
                : gallery.layout === "justified"
                  ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
                  : "columns-2 gap-3 sm:columns-3 md:columns-4"
            }
          >
            {filteredAssets.map((asset) => (
              <GalleryAssetCard
                key={asset.id}
                galleryId={galleryId}
                asset={asset}
                password={password}
                getAuthToken={user ? getAuthToken : undefined}
                onPreview={() => {
                  setPreviewAsset(asset);
                  fetchPreviewComments(asset.id);
                }}
                onDownload={
                  gallery.download_settings?.allow_single_download && clientMayDownloadFiles
                    ? () => handleDownload(asset)
                    : undefined
                }
                onFavoriteToggle={() => toggleFavorite(asset.id)}
                isFavorited={selectedFavorites.has(asset.id)}
                canDownload={
                  !!gallery.download_settings?.allow_single_download && clientMayDownloadFiles
                }
                downloading={downloadingId === asset.id}
                masonryLayout={gallery.layout === "masonry"}
                watermark={gallery.watermark}
                lut={effectiveLut}
                lutPreviewEnabled={lutPreviewEnabled}
                previewLutSource={clientLutSource}
                lutGradeMixPercent={
                  gallery.gallery_type === "video" ? 100 : lutGradeMix
                }
                isFeaturedVideo={gallery.featured_video_asset_id === asset.id}
                isVideoGallery={gallery.gallery_type === "video"}
              />
            ))}
          </div>
        )}
      </main>

      {selectedFavorites.size > 0 &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed right-6 top-1/2 z-40 flex w-48 -translate-y-1/2 flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
            role="complementary"
            aria-label="Favorites selection"
          >
            <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {selectedFavorites.size} selected
            </span>
            <div className="flex flex-col gap-2">
              {gallery.download_settings?.allow_selected_download && clientMayDownloadFiles && (
                <button
                  type="button"
                  onClick={handleDownloadSelected}
                  disabled={bulkDownloading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                >
                  <Download className="h-4 w-4" />
                  {bulkDownloading ? "Downloading…" : "Download selected"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSaveFavorites(true)}
                className="flex items-center justify-center rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
              >
                Save favorites list
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedFavorites(new Set());
                  try {
                    localStorage.removeItem(`gallery-favorites-${galleryId}`);
                  } catch {
                    // ignore
                  }
                }}
                className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400"
              >
                Clear
              </button>
            </div>
          </div>,
          document.body
        )}

      {showSaveFavorites && (
        <SaveFavoritesModal
          count={selectedFavorites.size}
          galleryId={galleryId}
          password={password || undefined}
          onSave={handleSaveFavorites}
          onClose={() => setShowSaveFavorites(false)}
        />
      )}

      {previewAsset && (
        <PreviewModal
          asset={previewAsset}
          previewImageUrl={previewImageUrl}
          previewImageRawUnavailable={previewImageRawUnavailable}
          isVideo={isVideo(previewAsset.name)}
          comments={previewComments}
          onClose={() => {
            setPreviewAsset(null);
            setPreviewComments([]);
            setPreviewImageRawUnavailable(false);
          }}
          onAddComment={(body, email, name) =>
            handleAddComment(previewAsset.id, body, email, name)
          }
          password={password}
          galleryId={galleryId}
          getAuthToken={user ? getAuthToken : undefined}
          watermark={gallery.watermark}
          lut={effectiveLut}
          creativeLutLibrary={gallery.creative_lut_library}
          lutOptions={galleryLutOptions}
          selectedLutId={selectedLutId}
          onLutSelect={(id) => setSelectedLutId(id)}
          lutPreviewEnabled={lutPreviewEnabled}
          onLutPreviewToggle={() => setLutPreviewEnabled((p) => !p)}
          allowComments={gallery.allow_comments !== false}
          previewLutSource={clientLutSource}
          lutGradeMixPercent={lutGradeMix}
          onLutGradeMixChange={
            isVideo(previewAsset.name) ? undefined : setLutGradeMix
          }
        />
      )}
    </div>
    </DashboardRouteFade>
  );
}
