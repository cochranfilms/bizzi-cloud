"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  X,
  MessageCircle,
  Music2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getGalleryBackgroundTheme } from "@/lib/gallery-background-themes";
import { getCoverObjectPosition } from "@/lib/cover-position";
import { HERO_HEIGHT_PRESETS } from "@/lib/cover-constants";
import type { HeroHeightPreset } from "@/lib/cover-constants";
import ImageWithLUT from "./ImageWithLUT";

interface GalleryData {
  id: string;
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
  lut?: { enabled?: boolean; storage_url?: string | null } | null;
  cover_asset_id?: string | null;
  cover_position?: string | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  cover_alt_text?: string | null;
  cover_overlay_opacity?: number | null;
  cover_title_alignment?: "left" | "center" | "right" | null;
  cover_hero_height?: "small" | "medium" | "large" | "cinematic" | null;
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

  if (savedListId && shareUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
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
}

function PreviewModal({
  asset,
  previewImageUrl,
  isVideo,
  comments,
  onClose,
  onAddComment,
  password,
  galleryId,
  getAuthToken,
  watermark,
  lut,
  lutPreviewEnabled = true,
  onLutPreviewToggle,
}: {
  asset: GalleryAsset;
  previewImageUrl: string | null;
  isVideo: boolean;
  comments: { id: string; body: string; client_name?: string | null; created_at: string }[];
  onClose: () => void;
  onAddComment: (body: string, email?: string, name?: string) => Promise<void>;
  password?: string;
  galleryId: string;
  getAuthToken?: () => Promise<string | null>;
  watermark?: { enabled?: boolean; image_url?: string | null; position?: string | null; opacity?: number | null };
  lut?: { enabled?: boolean; storage_url?: string | null } | null;
  lutPreviewEnabled?: boolean;
  onLutPreviewToggle?: () => void;
}) {
  const [commentBody, setCommentBody] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentName, setCommentName] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onClick={onClose}
    >
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        {lut?.enabled && lut?.storage_url && isImage(asset.name) && onLutPreviewToggle && (
          <button
            type="button"
            role="switch"
            aria-checked={lutPreviewEnabled}
            aria-label={`Creative preview ${lutPreviewEnabled ? "on" : "off"}`}
            onClick={(e) => {
              e.stopPropagation();
              onLutPreviewToggle();
            }}
            className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
          >
            <span
              className={`inline-block h-3 w-5 shrink-0 rounded-full border-2 border-white/80 transition-colors ${
                lutPreviewEnabled ? "bg-white/90" : "bg-transparent"
              }`}
            />
            Creative {lutPreviewEnabled ? "On" : "Off"}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div
        className="relative flex max-h-[90vh] max-w-4xl flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex flex-1 items-center justify-center">
          {isVideo ? (
            <p className="text-white">Video preview – full playback coming soon</p>
          ) : previewImageUrl ? (
            <>
              {lut?.enabled && lut?.storage_url && isImage(asset.name) && lutPreviewEnabled ? (
                <ImageWithLUT
                  imageUrl={previewImageUrl}
                  lutUrl={lut.storage_url}
                  lutEnabled={true}
                  className="max-h-[70vh] max-w-full"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewImageUrl}
                  alt=""
                  className="max-h-[70vh] max-w-full object-contain"
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
            </>
          ) : (
            <div className="flex h-64 w-64 items-center justify-center">
              <ImageIcon className="h-16 w-16 animate-pulse text-white/50" />
            </div>
          )}
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-white/20 bg-black/40 p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
            <MessageCircle className="h-4 w-4" />
            Comments
          </h3>
          <div className="mb-4 space-y-2">
            {comments.length === 0 ? (
              <p className="text-sm text-white/60">No comments yet.</p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded bg-white/10 px-3 py-2 text-sm text-white">
                  <p className="font-medium text-white/90">{c.client_name || "Anonymous"}</p>
                  <p>{c.body}</p>
                  <p className="mt-1 text-xs text-white/50">
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
          <form onSubmit={handleCommentSubmit} className="space-y-2">
            <input
              type="text"
              value={commentName}
              onChange={(e) => setCommentName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50"
            />
            <input
              type="email"
              value={commentEmail}
              onChange={(e) => setCommentEmail(e.target.value)}
              placeholder="Email (optional)"
              className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50"
            />
            <textarea
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
              className="w-full rounded border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50"
            />
            <button
              type="submit"
              disabled={submitting || !commentBody.trim()}
              className="rounded bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post comment"}
            </button>
          </form>
        </div>
      </div>
    </div>
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
  lutPreviewEnabled = true,
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
  lut?: { enabled?: boolean; storage_url?: string | null } | null;
  lutPreviewEnabled?: boolean;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const isImg = isImage(asset.name);
  const isVid = isVideo(asset.name);

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
        const blob = await res.blob();
        if (cancelled) return;
        const blobUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setThumbUrl(blobUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
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
        {thumbUrl ? (
          lut?.enabled && lut?.storage_url && isImg && lutPreviewEnabled ? (
            <div className={`block w-full transition-transform group-hover:scale-105 ${useNaturalAspect ? "h-auto" : "h-full"}`}>
              <ImageWithLUT
                imageUrl={thumbUrl}
                lutUrl={lut.storage_url}
                lutEnabled={true}
                objectFit="cover"
                className={`w-full ${useNaturalAspect ? "h-auto" : "h-full"}`}
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
        {isVid && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50">
              <Play className="ml-1 h-7 w-7 fill-white text-white" />
            </div>
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
  const { user } = useAuth();
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
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
  const [hasEnteredGallery, setHasEnteredGallery] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [lutPreviewEnabled, setLutPreviewEnabled] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState<{
    used: number;
    limit: number;
    remaining: number;
  } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

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
    if (!data || !hasEnteredGallery) return;
    fetchDownloadStatus();
  }, [data, hasEnteredGallery, fetchDownloadStatus]);

  useEffect(() => {
    if (!data || !hasEnteredGallery) return;
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
  }, [data, hasEnteredGallery, galleryId, password, user]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchGallery(passwordInput);
  };

  const getAuthToken = useCallback(
    async () => (user ? user.getIdToken() : null),
    [user]
  );

  useEffect(() => {
    if (!previewAsset || !isImage(previewAsset.name)) {
      setPreviewImageUrl(null);
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
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (!cancelled) setPreviewImageUrl(url);
        else URL.revokeObjectURL(url);
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
    };
  }, [previewAsset, galleryId, password, user]);

  const bannerAsset = data
    ? data.assets.find(
        (a) =>
          a.id === data.gallery.cover_asset_id && isImage(a.name)
      ) ?? data.assets.find((a) => isImage(a.name))
    : null;

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

  // Scroll to top when entering gallery, then scroll to gallery grid after transition
  useEffect(() => {
    if (!hasEnteredGallery) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    const t = setTimeout(() => {
      document.getElementById("gallery-grid")?.scrollIntoView({ behavior: "smooth" });
    }, 500);
    return () => clearTimeout(t);
  }, [hasEnteredGallery]);

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
    setDownloadingAll(true);
    setDownloadError(null);
    const downloadable = data.assets.filter(
      (a) =>
        a.media_type === "image" ||
        /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic|mp4|webm|mov|m4v)$/i.test(a.name)
    );
    for (let i = 0; i < downloadable.length; i++) {
      try {
        await downloadOne(downloadable[i], "full");
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
        break;
      }
    }
    setDownloadingAll(false);
  }, [data, downloadOne]);

  const handleDownloadSelected = useCallback(async () => {
    if (!data) return;
    const toDownload = data.assets.filter((a) => selectedFavorites.has(a.id));
    if (toDownload.length === 0) return;
    setDownloadingAll(true);
    setDownloadError(null);
    for (let i = 0; i < toDownload.length; i++) {
      try {
        await downloadOne(toDownload[i], "selected");
      } catch (err) {
        setDownloadError(err instanceof Error ? err.message : "Download failed");
        break;
      }
    }
    setDownloadingAll(false);
  }, [data, selectedFavorites, downloadOne]);

  useEffect(() => {
    if (hasEnteredGallery) setMusicPlaying(false);
  }, [hasEnteredGallery]);

  const prePageMusicUrlFromData = data?.gallery?.branding?.pre_page_music_url ?? null;
  useEffect(() => {
    if (!audioRef.current || !prePageMusicUrlFromData) return;
    if (musicPlaying) audioRef.current.play().catch(() => {});
    else audioRef.current.pause();
  }, [musicPlaying, prePageMusicUrlFromData]);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <ImageIcon className="mb-4 h-16 w-16 animate-pulse text-neutral-300 dark:text-neutral-600" />
        <p className="text-neutral-500 dark:text-neutral-400">Loading gallery…</p>
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
  const filteredAssets =
    selectedCollectionId === null
      ? assets
      : assets.filter(
          (a) => (a.collection_id ?? null) === selectedCollectionId
        );
  const accent = gallery.branding.accent_color ?? "#00BFFF";
  const bgTheme = getGalleryBackgroundTheme(gallery.branding.background_theme);
  const isDarkBg = bgTheme.textTone === "light";

  const coverObjectPosition = getCoverObjectPosition({
    cover_focal_x: gallery.cover_focal_x,
    cover_focal_y: gallery.cover_focal_y,
    cover_position: gallery.cover_position,
  });

  const prePageMusicUrl = gallery.branding.pre_page_music_url;
  const prePageInstructions = gallery.branding.pre_page_instructions;

  // Gallery Pre Page – cover experience before entering the gallery
  if (!hasEnteredGallery) {
    return (
      <div
        className="min-h-screen transition-colors"
        style={{ backgroundColor: bgTheme.background }}
      >
        <header
          className={`absolute left-0 right-0 top-0 z-20 border-b border-transparent ${
            bannerUrl ? "border-white/10" : isDarkBg ? "border-white/10" : "border-neutral-200"
          }`}
          style={{ ["--accent" as string]: accent }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link
              href="/"
              className={`flex items-center gap-2 ${bannerUrl ? "text-white" : isDarkBg ? "text-white" : "text-neutral-900"}`}
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
                  bannerUrl ? "text-white hover:bg-white/20" : "text-neutral-600 hover:bg-neutral-100"
                }`}
                title={musicPlaying ? "Pause music" : "Play music"}
              >
                <Music2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </header>

        <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-24 text-center sm:px-6">
          {bannerUrl ? (
            <>
              <div
                className="pointer-events-none absolute inset-0 z-0"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerUrl}
                  alt={gallery.cover_alt_text || gallery.title || "Gallery cover"}
                  className="h-full w-full object-cover"
                  style={{ objectPosition: coverObjectPosition }}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: (() => {
                      const o = Math.max(0, Math.min(100, gallery.cover_overlay_opacity ?? 50)) / 100;
                      return `linear-gradient(to bottom, rgba(0,0,0,${o * 0.6}) 0%, transparent 30%, transparent 70%, rgba(0,0,0,${o * 0.9}) 100%)`;
                    })(),
                  }}
                />
              </div>
              <div
                className={`relative z-10 flex flex-col gap-6 text-white ${
                  gallery.cover_title_alignment === "left"
                    ? "items-start text-left"
                    : gallery.cover_title_alignment === "right"
                      ? "items-end text-right"
                      : "items-center text-center"
                }`}
              >
                {gallery.event_date && (
                  <p className="text-xs font-medium uppercase tracking-widest text-white/90">
                    {new Date(gallery.event_date).toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
                {(gallery.branding.logo_url || gallery.branding.business_name) && (
                  <div className="flex items-center gap-2">
                    {gallery.branding.logo_url && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={gallery.branding.logo_url}
                        alt=""
                        className="h-10 w-10 rounded-full border-2 border-white/30 object-cover"
                      />
                    )}
                    <span className="text-sm font-medium uppercase tracking-wider text-white/95">
                      {gallery.branding.business_name || ""}
                    </span>
                  </div>
                )}
                <h1
                  className="max-w-3xl text-4xl font-semibold sm:text-5xl"
                  style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}
                >
                  {gallery.title}
                </h1>
                {gallery.branding.welcome_message && (
                  <p className="max-w-xl text-lg text-white/90">
                    {gallery.branding.welcome_message}
                  </p>
                )}
                {prePageInstructions && (
                  <p className="max-w-md text-sm text-white/75">
                    {prePageInstructions}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setHasEnteredGallery(true)}
                  className="rounded-xl px-8 py-4 text-lg font-medium text-white transition-all hover:scale-105 hover:opacity-95"
                  style={{ backgroundColor: accent }}
                >
                  View gallery
                </button>
              </div>
            </>
          ) : (
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
                  onClick={() => setHasEnteredGallery(true)}
                  className="rounded-xl px-8 py-4 text-lg font-medium text-white transition-opacity hover:opacity-90"
                  style={{ backgroundColor: accent }}
                >
                  View gallery
                </button>
              </div>
            </div>
          )}
        </div>

        {prePageMusicUrl && (
          <audio
            ref={audioRef}
            src={prePageMusicUrl}
            loop
            playsInline
            className="hidden"
          />
        )}
      </div>
    );
  }

  const scrollToGallery = () => {
    document.getElementById("gallery-grid")?.scrollIntoView({ behavior: "smooth" });
  };

  // Full gallery view (after clicking "View gallery")
  return (
    <div
      className="min-h-screen animate-gallery-enter transition-colors"
      style={{ backgroundColor: bgTheme.background }}
    >
      <header
        className={`border-b ${isDarkBg ? "border-white/10" : "border-neutral-200 dark:border-neutral-800"}`}
        style={{ ["--accent" as string]: accent }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/"
            className={`flex items-center gap-2 ${isDarkBg ? "text-white" : "text-neutral-900"}`}
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
        </div>
      </header>

      {bannerUrl && (
        <div
          className="relative w-full overflow-hidden"
          style={{
            minHeight: (() => {
              const key: HeroHeightPreset =
                gallery.cover_hero_height && gallery.cover_hero_height in HERO_HEIGHT_PRESETS
                  ? (gallery.cover_hero_height as HeroHeightPreset)
                  : "medium";
              const preset = HERO_HEIGHT_PRESETS[key];
              return `clamp(${preset.desktop}, 50vh, ${preset.mobile})`;
            })(),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt={gallery.cover_alt_text || gallery.title || "Gallery cover"}
            className="h-full w-full object-cover"
            style={{ objectPosition: coverObjectPosition }}
          />
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 text-center">
          {gallery.event_date && (
            <p
              className={`mb-1 text-xs font-medium uppercase tracking-widest ${
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
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            {(gallery.branding.logo_url || gallery.branding.business_name) && (
              <div className="flex items-center gap-2">
                {gallery.branding.logo_url && (
                  <Image
                    src={gallery.branding.logo_url}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                    unoptimized
                  />
                )}
                <span
                  className={`text-xs font-medium uppercase tracking-wider ${
                    isDarkBg ? "text-white/90" : "text-neutral-600"
                  }`}
                >
                  {gallery.branding.business_name || ""}
                </span>
              </div>
            )}
            <h1
              className={`text-3xl font-semibold sm:text-4xl ${
                isDarkBg ? "text-white" : "text-neutral-900"
              }`}
              style={{ fontFamily: "Georgia, Cambria, 'Times New Roman', serif" }}
            >
              {gallery.title}
            </h1>
            <button
              type="button"
              onClick={scrollToGallery}
              className="rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: accent }}
            >
              View gallery
            </button>
            {gallery.download_settings?.allow_full_gallery_download && assets.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={downloadingAll}
                className="flex items-center gap-2 rounded-lg border-2 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ borderColor: accent, color: accent }}
              >
                <Download className="h-4 w-4" />
                {downloadingAll ? "Downloading…" : "Download all"}
              </button>
            )}
          </div>
          {downloadError && (
            <div className="mx-auto mb-4 max-w-xl rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {downloadError}
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

        {gallery.lut?.enabled && gallery.lut?.storage_url && (
          <div className="mb-4 flex justify-center">
            <button
              type="button"
              role="switch"
              aria-checked={lutPreviewEnabled}
              aria-label={`Creative preview ${lutPreviewEnabled ? "on" : "off"}`}
              onClick={() => setLutPreviewEnabled((p) => !p)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                isDarkBg
                  ? "bg-white/15 text-white/90 hover:bg-white/20"
                  : "bg-neutral-200/80 text-neutral-700 hover:bg-neutral-300/80 dark:bg-neutral-700/80 dark:text-neutral-300 dark:hover:bg-neutral-600/80"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-6 shrink-0 rounded-full border-2 transition-colors ${
                  lutPreviewEnabled
                    ? "border-current bg-current"
                    : "border-current bg-transparent"
                }`}
              />
              Creative Preview {lutPreviewEnabled ? "On" : "Off"}
            </button>
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
                  ? "grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
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
                  gallery.download_settings?.allow_single_download
                    ? () => handleDownload(asset)
                    : undefined
                }
                onFavoriteToggle={() => toggleFavorite(asset.id)}
                isFavorited={selectedFavorites.has(asset.id)}
                canDownload={!!gallery.download_settings?.allow_single_download}
                downloading={downloadingId === asset.id}
                masonryLayout={gallery.layout === "masonry"}
                watermark={gallery.watermark}
                lut={gallery.lut}
                lutPreviewEnabled={lutPreviewEnabled}
              />
            ))}
          </div>
        )}
      </main>

      {selectedFavorites.size > 0 && (
        <div className="fixed right-6 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {selectedFavorites.size} selected
          </span>
          <div className="flex flex-col gap-2">
            {gallery.download_settings?.allow_selected_download && (
              <button
                type="button"
                onClick={handleDownloadSelected}
                disabled={downloadingAll}
                className="flex items-center justify-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {downloadingAll ? "Downloading…" : "Download selected"}
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
        </div>
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
          isVideo={isVideo(previewAsset.name)}
          comments={previewComments}
          onClose={() => {
            setPreviewAsset(null);
            setPreviewComments([]);
          }}
          onAddComment={(body, email, name) =>
            handleAddComment(previewAsset.id, body, email, name)
          }
          password={password}
          galleryId={galleryId}
          getAuthToken={user ? getAuthToken : undefined}
          watermark={gallery.watermark}
          lut={gallery.lut}
          lutPreviewEnabled={lutPreviewEnabled}
          onLutPreviewToggle={() => setLutPreviewEnabled((p) => !p)}
        />
      )}
    </div>
  );
}
