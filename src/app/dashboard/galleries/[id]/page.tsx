"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  Image as ImageIcon,
  Film,
  Copy,
  Check,
  Loader2,
  FolderOpen,
  Settings,
  Heart,
  ImagePlus,
  Star,
  Trash2,
  AlertCircle,
} from "lucide-react";
import GalleryAssetThumbnail from "@/components/gallery/GalleryAssetThumbnail";
import { useVideoThumbnail } from "@/hooks/useVideoThumbnail";
import { usePdfThumbnail } from "@/hooks/usePdfThumbnail";
import { useAuth } from "@/context/AuthContext";
import { getDisplayGalleryShareUrl } from "@/lib/gallery-share-url";
import { logGalleryProductEvent } from "@/lib/gallery-product-analytics";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { isGalleryVideo, isGalleryImage } from "@/lib/gallery-file-types";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import GalleryUploadZone from "@/components/gallery/GalleryUploadZone";
import { useGalleryManageAssetsPoll } from "@/hooks/useGalleryManageAssetsPoll";
import GalleryOwnerProfileBanner from "@/components/gallery/GalleryOwnerProfileBanner";
import GalleryDetailHealthAdvisories from "@/components/gallery/GalleryDetailHealthAdvisories";
import { GalleryVideoDetailStrip } from "@/components/gallery/GalleryVideoDetailStrip";
import type { GalleryManageUploadLifecycleEvent } from "@/lib/gallery-manage-upload-lifecycle";
import GalleryAddFromLibraryModal from "@/components/gallery/GalleryAddFromLibraryModal";

interface GalleryData {
  id: string;
  gallery_type?: "photo" | "video";
  media_mode?: "final" | "raw";
  title: string;
  slug: string;
  media_folder_segment?: string | null;
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
  source_format?: "raw" | "jpg";
  download_policy?: string | null;
  allow_comments?: boolean;
  allow_favorites?: boolean;
  workflow_status?: string | null;
  invoice_required_for_download?: boolean;
  invoice_status?: string | null;
}

interface GalleryAsset {
  id: string;
  name: string;
  object_key: string;
  media_type: "image" | "video";
  sort_order: number;
  is_visible?: boolean;
}

type ManagePendingUploadRow = {
  clientId: string;
  name: string;
  phase: "uploading" | "processing" | "failed";
  progressPct: number | null;
  errorMessage?: string;
};

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
  const [pendingUploads, setPendingUploads] = useState<ManagePendingUploadRow[]>([]);
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
      const res = await fetch(`/api/galleries/${id}/assets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { assets?: GalleryAsset[] };
      setAssets(data.assets ?? []);
    } catch {
      setAssets([]);
    }
  }, [user, id]);

  const onManageUploadLifecycle = useCallback((e: GalleryManageUploadLifecycleEvent) => {
    setPendingUploads((rows) => {
      if (e == null || typeof e !== "object" || !("type" in e)) return rows;
      const ix = rows.findIndex((r) => r.clientId === e.clientId);
      const next = [...rows];
      if (e.type === "file_added") {
        if (ix >= 0) return rows;
        return [...rows, { clientId: e.clientId, name: e.name, phase: "uploading", progressPct: 0 }];
      }
      if (e.type === "upload_progress") {
        const pct =
          e.bytesTotal > 0 ? Math.min(100, Math.round((e.bytesUploaded / e.bytesTotal) * 100)) : null;
        if (ix >= 0) {
          next[ix] = { ...next[ix], phase: "uploading", progressPct: pct };
          return next;
        }
        return rows;
      }
      if (e.type === "upload_processing") {
        if (ix >= 0) {
          next[ix] = { ...next[ix], phase: "processing", progressPct: 100 };
          return next;
        }
        return rows;
      }
      if (e.type === "upload_error") {
        if (ix >= 0) {
          next[ix] = {
            ...next[ix],
            phase: "failed",
            errorMessage: e.message,
            progressPct: null,
          };
          return next;
        }
        return [
          ...rows,
          {
            clientId: e.clientId,
            name: "",
            phase: "failed",
            errorMessage: e.message,
            progressPct: null,
          },
        ];
      }
      return rows;
    });
  }, []);

  useEffect(() => {
    setPendingUploads((rows) =>
      rows.filter((r) => {
        if (r.phase === "failed") return true;
        const name = r.name.trim().toLowerCase();
        if (!name) return true;
        return !assets.some((a) => a.name.toLowerCase() === name);
      })
    );
  }, [assets]);

  useGalleryManageAssetsPoll({
    galleryId: id,
    user,
    enabled: !loading && !!gallery && !!user,
    setAssets,
  });

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

  const [galleryShareUrl, setGalleryShareUrl] = useState("");
  useEffect(() => {
    if (!gallery || typeof window === "undefined") return;
    setGalleryShareUrl(
      getDisplayGalleryShareUrl({
        origin: window.location.origin,
        publicSlug: gallery.owner_handle,
        gallerySlug: gallery.slug,
        galleryId: id,
      })
    );
  }, [gallery, id]);
  const galleryUrl = galleryShareUrl || (typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : `/g/${id}`);

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
    logGalleryProductEvent("gallery_share_link_copied", { galleryId: id });
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
              href={`${navBase}/galleries/${id}/settings`}
              className="block rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
            >
              Want a branded link (yoursite.com/yourname/gallery-name)? Claim a studio handle in Gallery
              settings.
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

          <GalleryOwnerProfileBanner
            galleryType={isVideoGallery ? "video" : "photo"}
            mediaMode={gallery?.media_mode === "raw" ? "raw" : "final"}
          />

          <GalleryVideoDetailStrip gallery={gallery} assets={assets} />

          {assets.length > 0 && (
            <GalleryDetailHealthAdvisories
              galleryId={id}
              settingsHref={`${navBase}/galleries/${id}/settings`}
              galleryType={isVideoGallery ? "video" : "photo"}
              mediaMode={gallery?.media_mode === "raw" ? "raw" : "final"}
              assets={assets}
            />
          )}

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
                  Add From Files
                </button>
              </div>
            </div>
            <div className="border-b border-neutral-200 p-4 dark:border-neutral-700">
              <GalleryUploadZone
                galleryId={id}
                galleryTitle={gallery?.title}
                mediaFolderSegment={gallery?.media_folder_segment}
                mediaMode={gallery?.media_mode ?? "final"}
                galleryType={isVideoGallery ? "video" : "photo"}
                onGalleryManageUploadLifecycle={onManageUploadLifecycle}
                onGalleryAssetUploaded={() => {
                  void fetchAssets();
                  void fetchGallery();
                }}
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
            {assets.length === 0 && pendingUploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  {isVideoGallery
                    ? "Upload videos or add from your existing files to start this review gallery."
                    : "Upload photos or add from your existing files."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {pendingUploads.map((p) => (
                  <div
                    key={p.clientId}
                    className="relative flex aspect-square flex-col overflow-hidden rounded-lg border border-dashed border-bizzi-blue/50 bg-bizzi-blue/5 dark:border-bizzi-blue/40 dark:bg-bizzi-blue/10"
                  >
                    <div className="flex flex-1 flex-col items-center justify-center p-2 text-center">
                      {p.phase === "failed" ? (
                        <AlertCircle className="mb-1 h-8 w-8 text-red-500" />
                      ) : isVideoGallery ? (
                        <Film className="mb-1 h-8 w-8 text-bizzi-blue" />
                      ) : (
                        <ImageIcon className="mb-1 h-8 w-8 text-bizzi-blue" />
                      )}
                      <span className="line-clamp-2 text-xs font-medium text-neutral-800 dark:text-neutral-200">
                        {p.name || "Uploading…"}
                      </span>
                      <span className="mt-1 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        {p.phase === "uploading"
                          ? p.progressPct != null
                            ? `Uploading ${p.progressPct}%`
                            : "Uploading…"
                          : p.phase === "processing"
                            ? "Processing…"
                            : p.errorMessage ?? "Failed"}
                      </span>
                      {p.phase === "uploading" && p.progressPct != null && (
                        <div className="mt-2 h-1 w-full max-w-[90%] overflow-hidden rounded bg-neutral-200 dark:bg-neutral-700">
                          <div
                            className="h-full bg-bizzi-blue transition-all"
                            style={{ width: `${p.progressPct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
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
                      {a.is_visible === false && (
                        <div className="absolute right-0 top-0 rounded-bl bg-neutral-800/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Hidden
                        </div>
                      )}
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

      <GalleryAddFromLibraryModal
        open={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setSelectedIds(new Set());
        }}
        isVideoGallery={isVideoGallery}
        isTeamRoute={isTeamRoute}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        recentEligibleFiles={filesEligibleForFromFiles}
        onAdd={handleAddAssets}
        adding={adding}
      />
    </>
  );
}
