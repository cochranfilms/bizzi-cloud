"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  Plus,
  Image as ImageIcon,
  Film,
  Play,
  Copy,
  Check,
  Loader2,
  FolderOpen,
  Settings,
  Heart,
  ImagePlus,
  Star,
  Trash2,
} from "lucide-react";
import GalleryAssetThumbnail from "@/components/gallery/GalleryAssetThumbnail";
import { useThumbnail } from "@/hooks/useThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { useInView } from "@/hooks/useInView";
import { useAuth } from "@/context/AuthContext";
import type { RecentFile } from "@/hooks/useCloudFiles";

function AddFileButton({
  file,
  selected,
  onToggle,
}: {
  file: RecentFile;
  selected: boolean;
  onToggle: () => void;
}) {
  const [btnRef, isInView] = useInView<HTMLButtonElement>();
  const thumbnailUrl = useThumbnail(file.objectKey, file.name, "thumb", {
    enabled: isInView,
  });
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(file.name) || (file.contentType?.startsWith("video/") ?? false);
  const videoThumbnailUrl = useVideoThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isVideo && isInView,
    isVideo,
  });
  const isPdf = /\.pdf$/i.test(file.name) || file.contentType === "application/pdf";
  const pdfThumbnailUrl = usePdfThumbnail(file.objectKey, file.name, {
    enabled: !!file.objectKey && isPdf && isInView,
  });

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onToggle}
      className={`relative flex aspect-square flex-col items-center justify-center overflow-hidden rounded-lg border-2 p-1 transition-colors ${
        selected
          ? "border-bizzi-blue bg-bizzi-blue/10"
          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
      }`}
    >
      {(thumbnailUrl || videoThumbnailUrl || pdfThumbnailUrl) ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from thumbnail API, video frame, or PDF first page */}
          <img
            src={videoThumbnailUrl ?? pdfThumbnailUrl ?? thumbnailUrl ?? ""}
            alt=""
            className="h-full w-full object-cover"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 shadow-lg">
                <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          {isVideo ? (
            <Film className="h-6 w-6 text-neutral-500" />
          ) : (
            <ImageIcon className="h-6 w-6 text-neutral-500" />
          )}
        </div>
      )}
      <span className="mt-1 w-full truncate text-center text-xs">
        {file.name}
      </span>
    </button>
  );
}
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { isGalleryVideo, isGalleryImage } from "@/lib/gallery-file-types";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import GalleryUploadZone from "@/components/gallery/GalleryUploadZone";

interface GalleryData {
  id: string;
  gallery_type?: "photo" | "video";
  media_mode?: "final" | "raw";
  title: string;
  slug: string;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode: string;
  layout: string;
  view_count: number;
  download_count: number;
  cover_asset_id?: string | null;
  featured_video_asset_id?: string | null;
  owner_handle?: string | null;
  version?: number;
  branding?: { business_name?: string; accent_color?: string };
}

interface GalleryAsset {
  id: string;
  name: string;
  object_key: string;
  media_type: "image" | "video";
  sort_order: number;
}

export default function GalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const navBase =
    typeof pathname === "string" && pathname.startsWith("/team/")
      ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? "/dashboard")
      : "/dashboard";
  const galleriesRoot = `${navBase}/galleries`;
  const id = params?.id as string;
  const { user } = useAuth();
  const { recentFiles, refetch: refetchCloudFiles } = useCloudFiles();

  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [settingCover, setSettingCover] = useState<string | null>(null);
  const [settingFeatured, setSettingFeatured] = useState<string | null>(null);
  const [removingAssetId, setRemovingAssetId] = useState<string | null>(null);
  const isVideoGallery = gallery?.gallery_type === "video";
  const isTeamRoute =
    typeof pathname === "string" && pathname.startsWith("/team/");

  useEffect(() => {
    if (showAddModal) void refetchCloudFiles();
  }, [showAddModal, refetchCloudFiles]);

  const handleRemoveAsset = async (assetId: string, fileName: string) => {
    if (!user || !id) return;
    const confirmed = window.confirm(
      `Remove "${fileName}" from this gallery? Files you added via "From files" stay in your library (only the gallery link is removed). Files you uploaded directly to this gallery are deleted from storage as well. This cannot be undone.`
    );
    if (!confirmed) return;
    setRemovingAssetId(assetId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}/assets/${assetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to remove asset");
      }
      await fetchAssets();
      await fetchGallery();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Failed to remove asset");
    } finally {
      setRemovingAssetId(null);
    }
  };

  const handleSetFeaturedVideo = async (assetId: string) => {
    if (!user || !id || gallery?.version == null || !isVideoGallery) return;
    setSettingFeatured(assetId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ featured_video_asset_id: assetId, version: gallery.version }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to set featured video");
      }
      await fetchGallery();
    } catch (err) {
      console.error("Set featured video failed:", err);
    } finally {
      setSettingFeatured(null);
    }
  };

  const handleSetCover = async (assetId: string) => {
    if (!user || !id || gallery?.version == null) return;
    setSettingCover(assetId);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cover_asset_id: assetId, version: gallery.version }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to set cover");
      }
      await fetchGallery();
    } catch (err) {
      console.error("Set cover failed:", err);
    } finally {
      setSettingCover(null);
    }
  };

  const fetchGallery = useCallback(async () => {
    if (!user || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) router.replace(galleriesRoot);
        return;
      }
      const data = await res.json();
      setGallery(data);
    } catch {
      router.replace(galleriesRoot);
    }
  }, [user, id, router, galleriesRoot]);

  const fetchAssets = useCallback(async () => {
    if (!user || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}/view`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setAssets(data.assets ?? []);
    } catch {
      setAssets([]);
    }
  }, [user, id]);

  useEffect(() => {
    if (!user || !id) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      await Promise.all([fetchGallery(), fetchAssets()]);
      setLoading(false);
    })();
  }, [user, id, fetchGallery, fetchAssets]);

  const handleAddAssets = async () => {
    if (!user || selectedIds.size === 0) return;
    setAdding(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}/assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          backup_file_ids: Array.from(selectedIds),
          asset_origin: "linked",
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to add");
      }
      setShowAddModal(false);
      setSelectedIds(new Set());
      await fetchAssets();
      await fetchGallery();
    } catch (err) {
      console.error("Add assets failed:", err);
    } finally {
      setAdding(false);
    }
  };

  const toggleSelect = (fileId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  const brandedUrl =
    gallery?.owner_handle && gallery?.slug
      ? `${typeof window !== "undefined" ? window.location.origin : ""}/${encodeURIComponent(gallery.owner_handle)}/${encodeURIComponent(gallery.slug)}`
      : null;
  const galleryUrl = brandedUrl ?? (typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : `/g/${id}`);

  const filesEligibleForFromFiles = recentFiles.filter((f) => {
    if (f.driveName === "Gallery Media") return false;
    if (isVideoGallery) {
      if (!isGalleryVideo(f.name)) return false;
      if (f.contentType?.startsWith("image/")) return false;
      return true;
    }
    if (!isGalleryImage(f.name)) return false;
    if (f.contentType?.startsWith("video/")) return false;
    return true;
  });

  const copyLink = () => {
    navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <TopBar title={gallery?.title ?? "Gallery"} />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <DashboardRouteFade
          ready={!loading && !!gallery}
          srOnlyMessage="Loading gallery"
        >
        {gallery ? (
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            href={galleriesRoot}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to galleries
          </Link>

          {!gallery?.owner_handle && (
            <Link
              href="/dashboard/settings"
              className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            >
              Set your profile handle in Settings to get branded share URLs like bizzicloud.io/yourhandle/gallery-name
            </Link>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
                {gallery.title}
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {assets.length} asset{assets.length !== 1 ? "s" : ""} · {gallery.view_count} views · {gallery.download_count} downloads
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`${navBase}/galleries/${id}/proofing`}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Heart className="h-4 w-4" />
                Proofing
              </Link>
              <Link
                href={`${navBase}/galleries/${id}/settings`}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-green-600" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Copy link
                  </>
                )}
              </button>
              <a
                href={galleryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
              >
                <ExternalLink className="h-4 w-4" />
                View gallery
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <h2 className="font-medium text-neutral-900 dark:text-white">
                {isVideoGallery ? "Video" : "Photo"} ·{" "}
                {gallery?.media_mode === "raw" ? "RAW" : "Final"} · Assets
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  <FolderOpen className="h-4 w-4" />
                  From files
                </button>
              </div>
            </div>
            <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
              <GalleryUploadZone
                galleryId={id}
                galleryTitle={gallery?.title}
                mediaMode={gallery?.media_mode ?? "final"}
                galleryType={isVideoGallery ? "video" : "photo"}
                onUploadComplete={() => {
                  fetchAssets();
                  fetchGallery();
                  // Refetch after delay so multipart/server-processing has time to add gallery assets
                  setTimeout(() => {
                    fetchAssets();
                    fetchGallery();
                  }, 1500);
                }}
              />
            </div>
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {isVideoGallery
                    ? "Upload videos or add from your existing files to start this review gallery."
                    : "Upload photos or add from your existing files."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {assets.map((a) => {
                  const isImage = a.media_type === "image" || /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i.test(a.name);
                  const isVideo = a.media_type === "video" || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(a.name);
                  const isCover = gallery.cover_asset_id === a.id;
                  const isFeatured = gallery.featured_video_asset_id === a.id;
                  const settingThis = settingCover === a.id;
                  const settingFeaturedThis = settingFeatured === a.id;
                  const removingThis = removingAssetId === a.id;
                  return (
                    <div
                      key={a.id}
                      className="group relative overflow-hidden rounded-lg"
                    >
                      <GalleryAssetThumbnail
                        galleryId={id}
                        objectKey={a.object_key}
                        name={a.name}
                        mediaType={a.media_type}
                        className="w-full rounded-lg"
                      />
                      {isCover && (
                        <div className="absolute left-0 top-0 rounded-br bg-bizzi-blue px-2 py-0.5 text-xs font-medium text-white">
                          Cover
                        </div>
                      )}
                      {isVideoGallery && isFeatured && (
                        <div className="absolute left-0 top-0 mt-6 rounded-br bg-violet-600 px-2 py-0.5 text-xs font-medium text-white">
                          Featured
                        </div>
                      )}
                      <div className="absolute inset-0 flex flex-wrap items-center justify-center gap-2 rounded-lg bg-black/40 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        {isImage && (
                          <button
                            type="button"
                            onClick={() => handleSetCover(a.id)}
                            disabled={settingThis || isCover || removingThis}
                            className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-white disabled:opacity-50"
                          >
                            {settingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="h-4 w-4" />
                            )}
                            {settingThis ? "Setting…" : "Set as cover"}
                          </button>
                        )}
                        {isVideoGallery && isVideo && (
                          <button
                            type="button"
                            onClick={() => handleSetFeaturedVideo(a.id)}
                            disabled={settingFeaturedThis || isFeatured || removingThis}
                            className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-white disabled:opacity-50"
                          >
                            {settingFeaturedThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Star className="h-4 w-4" />
                            )}
                            {settingFeaturedThis ? "Setting…" : "Set featured"}
                          </button>
                        )}
                        {!isImage && isVideo && !isVideoGallery && (
                          <button
                            type="button"
                            onClick={() => handleSetCover(a.id)}
                            disabled={settingThis || isCover || removingThis}
                            className="flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-sm font-medium text-neutral-800 shadow hover:bg-white disabled:opacity-50"
                          >
                            {settingThis ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <ImagePlus className="h-4 w-4" />
                            )}
                            {settingThis ? "Setting…" : "Set as cover"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveAsset(a.id, a.name)}
                          disabled={removingThis}
                          className="flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-50"
                        >
                          {removingThis ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          {removingThis ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        ) : null}
        </DashboardRouteFade>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                {isVideoGallery ? "Add videos" : "Add photos"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedIds(new Set());
                }}
                className="text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-200"
              >
                ×
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                {isVideoGallery
                  ? isTeamRoute
                    ? "Choose from recent videos in this team workspace (Storage, RAW, etc.). Gallery Media is excluded. Videos only."
                    : "Choose from your recent video files (Storage, RAW, etc.). Gallery Media is excluded. Videos only."
                  : isTeamRoute
                    ? "Choose from recent photos in this team workspace (Storage, RAW, etc.). Gallery Media is excluded. Photos only — no videos."
                    : "Choose from your recent photos (Storage, RAW, etc.). Gallery Media is excluded. Photos only — no videos."}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {filesEligibleForFromFiles.slice(0, 120).map((f) => (
                    <AddFileButton
                      key={f.id}
                      file={f}
                      selected={selectedIds.has(f.id)}
                      onToggle={() => toggleSelect(f.id)}
                    />
                  ))}
              </div>
              {filesEligibleForFromFiles.length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-500">
                  {isVideoGallery
                    ? "No video files in recent uploads. Upload some videos first."
                    : "No image files in recent uploads. Upload some photos first."}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => {
                  setShowAddModal(false);
                  setSelectedIds(new Set());
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddAssets}
                disabled={adding || selectedIds.size === 0}
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {adding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding…
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add {selectedIds.size} file{selectedIds.size !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
