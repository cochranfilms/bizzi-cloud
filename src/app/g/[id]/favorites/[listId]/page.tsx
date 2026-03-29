"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Lock,
  Download,
  Image as ImageIcon,
  Film,
  Play,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useGalleryBulkDownload } from "@/hooks/useGalleryBulkDownload";
import { getGalleryBackgroundTheme } from "@/lib/gallery-background-themes";
import VideoScrubThumbnail from "@/components/dashboard/VideoScrubThumbnail";
import { isSelectsPublicSharePathname } from "@/lib/gallery-proofing-types";

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

function isImage(name: string) {
  return IMAGE_EXT.test(name.toLowerCase());
}
function isVideo(name: string) {
  return VIDEO_EXT.test(name.toLowerCase());
}

interface FavoritesAsset {
  id: string;
  name: string;
  object_key: string;
  media_type: string;
}

export default function FavoritesListPage() {
  const params = useParams();
  const pathname = usePathname();
  const galleryId = params?.id as string;
  const listId = params?.listId as string;
  const { user } = useAuth();
  const isSelectsShare = isSelectsPublicSharePathname(pathname);

  const [data, setData] = useState<{
    list: { client_name?: string | null; asset_ids: string[] };
    gallery: { title: string; branding: Record<string, unknown>; download_settings: Record<string, unknown> };
    assets: FavoritesAsset[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const {
    download: bulkDownload,
    isLoading: bulkDownloading,
    error: bulkDownloadError,
  } = useGalleryBulkDownload({
    galleryId,
    user: user ?? null,
    password: password || null,
  });

  const fetchFavoritesList = useCallback(
    async (pwd?: string) => {
      if (!galleryId || !listId) return;
      setError(null);
      setErrorCode(null);
      try {
        const url = new URL(
          `/api/galleries/${galleryId}/favorites/${listId}`,
          window.location.origin
        );
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
          list: body.list,
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
    [galleryId, listId, user]
  );

  useEffect(() => {
    const pwd = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("password") : null;
    fetchFavoritesList(pwd ?? undefined);
  }, [fetchFavoritesList]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    fetchFavoritesList(passwordInput);
  };

  const getAuthToken = useCallback(
    async () => (user ? user.getIdToken() : null),
    [user]
  );

  const downloadOne = useCallback(
    async (asset: FavoritesAsset) => {
      setDownloadError(null);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (user) {
        const t = await user.getIdToken();
        if (t) headers.Authorization = `Bearer ${t}`;
      }
      const body: Record<string, unknown> = {
        object_key: asset.object_key,
        name: asset.name,
        download_context: "selected",
      };
      if (password) body.password = password;
      const res = await fetch(`/api/galleries/${galleryId}/download`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message ?? json.error ?? "Download failed");
      }
      const a = document.createElement("a");
      a.href = json.url?.startsWith("/") ? `${window.location.origin}${json.url}` : json.url;
      a.download = asset.name;
      a.rel = "noopener noreferrer";
      a.click();
    },
    [galleryId, user, password]
  );

  const handleDownload = async (asset: FavoritesAsset) => {
    setDownloadingId(asset.id);
    setDownloadError(null);
    try {
      await downloadOne(asset);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  };

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
    await bulkDownload(items, "selected");
  }, [data, bulkDownload]);

  if (loading && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-bizzi-blue" />
        <p className="text-neutral-500 dark:text-neutral-400">
          {isSelectsShare ? "Loading selects…" : "Loading favorites…"}
        </p>
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
              Enter the gallery password to view{" "}
              {isSelectsShare ? "these selects" : "these favorites"}.
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
              {isSelectsShare ? "View selects" : "View favorites"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <ImageIcon className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          {isSelectsShare ? "Selects not found" : "Favorites not found"}
        </h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">{error}</p>
        <Link
          href={`/g/${galleryId}`}
          className="text-bizzi-blue hover:text-bizzi-cyan"
        >
          Back to gallery
        </Link>
      </div>
    );
  }

  const { list, gallery, assets } = data;
  const branding = (gallery.branding ?? {}) as { business_name?: string; accent_color?: string };
  const downloadSettings = (gallery.download_settings ?? {}) as {
    allow_single_download?: boolean;
    allow_selected_download?: boolean;
  };
  const accent = branding.accent_color ?? "#00BFFF";
  const canDownload =
    downloadSettings.allow_single_download !== false ||
    downloadSettings.allow_selected_download !== false;
  const bgTheme = getGalleryBackgroundTheme((gallery.branding as { background_theme?: string })?.background_theme);
  const isDarkBg = bgTheme.textTone === "light";

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: bgTheme.background }}
    >
      <header
        className={`border-b ${isDarkBg ? "border-white/10" : "border-neutral-200 dark:border-neutral-800"}`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href={`/g/${galleryId}${password ? `?password=${encodeURIComponent(password)}` : ""}`}
            className={`flex items-center gap-2 ${isDarkBg ? "text-white" : "text-neutral-900 dark:text-white"}`}
          >
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="text-base font-semibold tracking-tight">
              {branding.business_name || "Gallery"}
            </span>
          </Link>
          <Link
            href={`/g/${galleryId}${password ? `?password=${encodeURIComponent(password)}` : ""}`}
            className="text-sm font-medium hover:opacity-80"
            style={{ color: accent }}
          >
            Back to gallery
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 text-center">
          <h1
            className={`text-3xl font-semibold sm:text-4xl ${
              isDarkBg ? "text-white" : "text-neutral-900 dark:text-white"
            }`}
          >
            {list.client_name
              ? isSelectsShare
                ? `${list.client_name}'s selects`
                : `${list.client_name}'s favorites`
              : isSelectsShare
                ? "Selects"
                : "Favorites"}
          </h1>
          <p
            className={`mt-1 ${
              isDarkBg ? "text-white/80" : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {assets.length}{" "}
            {isSelectsShare
              ? `clip${assets.length !== 1 ? "s" : ""}`
              : `photo${assets.length !== 1 ? "s" : ""}`}{" "}
            selected
          </p>
          {canDownload && assets.length > 0 && (
            <button
              type="button"
              onClick={handleDownloadAll}
              disabled={bulkDownloading}
              className="mt-4 flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: accent }}
            >
              <Download className="h-4 w-4" />
              {bulkDownloading ? "Downloading…" : "Download all"}
            </button>
          )}
          {(bulkDownloadError ?? downloadError) && (
            <div className="mx-auto mt-4 max-w-xl rounded-lg bg-red-100 px-4 py-2 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-300">
              {bulkDownloadError ?? downloadError}
            </div>
          )}
        </div>

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
              {isSelectsShare
                ? "No clips in this selects list."
                : "No photos in this favorites list."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {assets.map((asset) => (
              <FavoritesAssetCard
                key={asset.id}
                galleryId={galleryId}
                asset={asset}
                password={password}
                getAuthToken={getAuthToken}
                onDownload={canDownload ? () => handleDownload(asset) : undefined}
                downloading={downloadingId === asset.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FavoritesAssetCard({
  galleryId,
  asset,
  password,
  getAuthToken,
  onDownload,
  downloading,
}: {
  galleryId: string;
  asset: FavoritesAsset;
  password: string;
  getAuthToken: () => Promise<string | null>;
  onDownload?: () => void;
  downloading: boolean;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const thumbRef = useRef<string | null>(null);
  const isImg = isImage(asset.name);
  const isVid = isVideo(asset.name);

  const fetchGalleryVideoStreamUrl = useCallback(async (): Promise<string | null> => {
    try {
      const params = new URLSearchParams({
        object_key: asset.object_key,
        name: asset.name,
      });
      if (password) params.set("password", password);
      const t = await getAuthToken();
      const headers: Record<string, string> = {};
      if (t) headers.Authorization = `Bearer ${t}`;
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
        const t = await getAuthToken();
        if (t) headers.Authorization = `Bearer ${t}`;
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
        if (thumbRef.current) URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = blobUrl;
        setThumbUrl(blobUrl);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (thumbRef.current) {
        URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = null;
      }
      setThumbUrl(null);
    };
  }, [galleryId, asset.object_key, asset.name, isImg, isVid, password, getAuthToken]);

  return (
    <div className="group relative overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
      <div className="aspect-square">
        {isVid ? (
          <VideoScrubThumbnail
            fetchStreamUrl={fetchGalleryVideoStreamUrl}
            thumbnailUrl={thumbUrl}
            showPlayIcon
            scrubEnabled={false}
            className="h-full w-full"
          />
        ) : thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageIcon className="h-12 w-12 text-neutral-400" />
          </div>
        )}
      </div>
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          disabled={downloading}
          className="absolute bottom-2 right-2 rounded-lg bg-black/60 px-3 py-2 text-sm font-medium text-white transition-opacity hover:bg-black/80 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
