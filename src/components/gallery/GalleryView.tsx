"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Lock,
  Key,
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
  watermark: { enabled: boolean };
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
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;

function SaveFavoritesModal({
  count,
  onSave,
  onClose,
}: {
  count: number;
  onSave: (email: string, name: string) => Promise<void>;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(email.trim(), name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>
      <div
        className="relative flex max-h-[90vh] max-w-4xl flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-1 items-center justify-center">
          {isVideo ? (
            <p className="text-white">Video preview – full playback coming soon</p>
          ) : previewImageUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={previewImageUrl}
              alt=""
              className="max-h-[70vh] max-w-full object-contain"
            />
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

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

function isImage(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
}
function isVideo(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
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
          size: "medium",
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
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [pinInput, setPinInput] = useState("");
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
  const [previewComments, setPreviewComments] = useState<
    { id: string; body: string; client_name?: string | null; created_at: string }[]
  >([]);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [hasEnteredGallery, setHasEnteredGallery] = useState(false);
  const [musicPlaying, setMusicPlaying] = useState(false);
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
    async (clientEmail: string, clientName: string) => {
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
      setSelectedFavorites(new Set());
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem(`gallery-favorites-${galleryId}`);
        } catch {
          // ignore
        }
      }
      setShowSaveFavorites(false);
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
      if (pinInput) body.pin = pinInput;
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
    },
    [galleryId, user, password, pinInput]
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

  if (errorCode === "password_required" || (error && !data)) {
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
              {error ?? "Sign in with an invited email to access this gallery."}
            </p>
          </div>
          <Link
            href={`/login?redirect=${encodeURIComponent(`/g/${galleryId}`)}`}
            className="flex w-full items-center justify-center rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            Sign in to access
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

  const { gallery, assets } = data;
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
                {(gallery.download_settings?.allow_single_download ||
                  gallery.download_settings?.allow_full_gallery_download ||
                  gallery.download_settings?.allow_selected_download) &&
                  gallery.access_mode === "pin" && (
                  <div className="rounded-lg border border-amber-400/50 bg-amber-900/30 px-4 py-3">
                    <p className="text-sm text-amber-100">
                      Enter your download PIN below when viewing the gallery to unlock downloads.
                    </p>
                    <input
                      type="text"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="PIN"
                      className="mt-2 w-28 rounded border border-amber-400/50 bg-amber-900/50 px-3 py-1.5 text-center text-sm text-white placeholder-white/50"
                    />
                  </div>
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
                {gallery.access_mode === "pin" && (
                  <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                    <input
                      type="text"
                      value={pinInput}
                      onChange={(e) => setPinInput(e.target.value)}
                      placeholder="Download PIN"
                      className="w-32 rounded border border-amber-300 px-3 py-2 text-center text-sm dark:border-amber-700 dark:bg-amber-900/30 dark:text-white"
                    />
                  </div>
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
      className="min-h-screen transition-colors"
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
        <div className="relative h-48 w-full overflow-hidden sm:h-56">
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
                  <img
                    src={gallery.branding.logo_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
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

        {(gallery.download_settings?.allow_single_download ||
          gallery.download_settings?.allow_full_gallery_download ||
          gallery.download_settings?.allow_selected_download) &&
          gallery.access_mode === "pin" && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Key className="h-5 w-5" />
              <span className="font-medium">Download PIN</span>
            </div>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
              Enter the download PIN below when downloading to unlock full resolution.
            </p>
            <input
              type="text"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              className="mt-3 w-32 rounded-lg border border-amber-300 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-900/30 dark:text-white"
            />
          </div>
        )}

        {assets.length === 0 ? (
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
              This gallery has no photos or videos yet.
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
            {assets.map((asset) => (
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
              />
            ))}
          </div>
        )}
      </main>

      {selectedFavorites.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-4 rounded-xl border border-neutral-200 bg-white px-5 py-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {selectedFavorites.size} selected
          </span>
          {gallery.download_settings?.allow_selected_download && (
            <button
              type="button"
              onClick={handleDownloadSelected}
              disabled={downloadingAll}
              className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              {downloadingAll ? "Downloading…" : "Download selected"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSaveFavorites(true)}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
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
      )}

      {showSaveFavorites && (
        <SaveFavoritesModal
          count={selectedFavorites.size}
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
        />
      )}
    </div>
  );
}
