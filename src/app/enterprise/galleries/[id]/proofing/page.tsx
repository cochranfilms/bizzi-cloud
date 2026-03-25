"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Heart,
  MessageCircle,
  Copy,
  Check,
  Loader2,
  Film,
  Download,
  FolderPlus,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useGalleryBulkDownload } from "@/hooks/useGalleryBulkDownload";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import GalleryAssetThumbnail from "@/components/gallery/GalleryAssetThumbnail";
import RawPreviewPlaceholder from "@/components/gallery/RawPreviewPlaceholder";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";

interface FavoritesList {
  id: string;
  client_email: string | null;
  client_name: string | null;
  asset_ids: string[];
  created_at: string | null;
}

interface Comment {
  id: string;
  asset_id: string;
  client_email: string | null;
  client_name: string | null;
  body: string;
  created_at: string | null;
}

interface GalleryAsset {
  id: string;
  name: string;
  object_key?: string;
  media_type?: "image" | "video";
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

const HOVER_HIDE_DELAY_MS = 350;

function ProofingAssetCell({
  galleryId,
  asset,
}: {
  galleryId: string;
  asset: GalleryAsset;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const cellRef = useRef<HTMLTableCellElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const objectKey = asset.object_key ?? "";
  const isImage = IMAGE_EXT.test(asset.name);
  const isVideo = VIDEO_EXT.test(asset.name);
  const { url: previewUrl, rawPreviewUnavailable } = useGalleryThumbnail(
    galleryId,
    objectKey,
    asset.name,
    {
      enabled: (isImage || isVideo) && isHovered,
      size: "medium",
    }
  );

  const clearHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const scheduleHide = () => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => setIsHovered(false), HOVER_HIDE_DELAY_MS);
  };

  const handleMouseEnter = () => {
    clearHideTimeout();
    setIsHovered(true);
  };

  useEffect(() => {
    return () => clearHideTimeout();
  }, []);

  useEffect(() => {
    if (!isHovered || !cellRef.current) {
      setCoords(null);
      return;
    }
    const updatePos = () => {
      if (cellRef.current) {
        const rect = cellRef.current.getBoundingClientRect();
        setCoords({ x: rect.left, y: rect.top + rect.height / 2 });
      }
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [isHovered]);

  const popup = isHovered && (isImage || isVideo) && coords && typeof document !== "undefined" && createPortal(
    <div
      className="fixed z-[100] -translate-y-1/2"
      style={{
        left: Math.min(coords.x + 12, window.innerWidth - 300),
        top: coords.y,
        width: 280,
        height: 280,
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={scheduleHide}
    >
      <div
        className="h-full w-full overflow-hidden rounded-xl border-2 border-white bg-neutral-900 shadow-2xl ring-2 ring-neutral-500/30"
        style={{ animation: "proofing-popup 0.15s ease-out" }}
      >
        {rawPreviewUnavailable && isImage ? (
          <div className="h-full overflow-y-auto p-1">
            <RawPreviewPlaceholder fileName={asset.name} className="min-h-0 text-[9px]" />
          </div>
        ) : previewUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-neutral-800">
            {isVideo ? (
              <Film className="h-12 w-12 text-neutral-500" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-neutral-500" />
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );

  return (
    <td ref={cellRef} className="px-4 py-3">
      <div
        className="flex items-center gap-3"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleHide}
      >
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded">
          <GalleryAssetThumbnail
            galleryId={galleryId}
            objectKey={objectKey}
            name={asset.name}
            mediaType={asset.media_type ?? "image"}
            className="h-10 w-10"
          />
        </div>
        <span className="truncate font-mono text-xs text-neutral-600 dark:text-neutral-400">
          {asset.name}
        </span>
      </div>
      {popup}
    </td>
  );
}

export default function GalleryProofingPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { user } = useAuth();
  const [galleryTitle, setGalleryTitle] = useState("");
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [favorites, setFavorites] = useState<FavoritesList[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "favorited" | "commented">("all");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState(false);

  const { bumpStorageVersion } = useBackup();

  const fetchData = useCallback(async () => {
    if (!user || !id) return;
    try {
      const token = await user.getIdToken();
      const [viewRes, favRes, commentsRes] = await Promise.all([
        fetch(`/api/galleries/${id}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/galleries/${id}/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/galleries/${id}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!viewRes.ok) {
        if (viewRes.status === 404) router.replace("/enterprise/galleries");
        return;
      }

      const viewData = await viewRes.json();
      setGalleryTitle(viewData.gallery?.title ?? "Gallery");
      setAssets(viewData.assets ?? []);

      if (favRes.ok) {
        const favData = await favRes.json();
        setFavorites(favData.lists ?? []);
      }

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        setComments(commentsData.comments ?? []);
      }
    } catch {
      router.replace("/enterprise/galleries");
    } finally {
      setLoading(false);
    }
  }, [user, id, router]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const favoritedAssetIds = new Set(favorites.flatMap((f) => f.asset_ids));
  const commentedAssetIds = new Set(comments.map((c) => c.asset_id));

  const selectedList = selectedListId
    ? favorites.find((f) => f.id === selectedListId)
    : null;
  const selectedListAssetIds = selectedList
    ? new Set(selectedList.asset_ids)
    : null;

  const effectiveFavoritedIds = selectedListAssetIds ?? favoritedAssetIds;

  const favoritedDownloadItems = assets
    .filter(
      (a) =>
        effectiveFavoritedIds.has(a.id) &&
        a.object_key &&
        (a.media_type === "image" ||
          a.media_type === "video" ||
          IMAGE_EXT.test(a.name) ||
          VIDEO_EXT.test(a.name))
    )
    .map((a) => ({ object_key: a.object_key!, name: a.name }));

  const {
    download: downloadFavorites,
    isLoading: isDownloadingFavorites,
    error: downloadError,
  } = useGalleryBulkDownload({ galleryId: id, user, password: null });

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [createFolderSuccess, setCreateFolderSuccess] = useState<{ message: string; driveId?: string } | null>(null);
  const [createdFolderDriveId, setCreatedFolderDriveId] = useState<string | null>(null);

  const favoritedAssetIdsForFolder = assets
    .filter(
      (a) =>
        effectiveFavoritedIds.has(a.id) &&
        a.object_key &&
        (a.media_type === "image" ||
          a.media_type === "video" ||
          IMAGE_EXT.test(a.name) ||
          VIDEO_EXT.test(a.name))
    )
    .map((a) => a.id);

  const handleDownloadFavorites = () => {
    if (favoritedDownloadItems.length === 0) return;
    downloadFavorites(favoritedDownloadItems, "selected");
  };

  const handleCreateFavoriteFolder = async () => {
    if (favoritedAssetIdsForFolder.length === 0) return;
    setIsCreatingFolder(true);
    setCreateFolderError(null);
    setCreateFolderSuccess(null);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/galleries/${id}/create-favorite-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ asset_ids: favoritedAssetIdsForFolder }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        files_saved?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create folder");
      }
      bumpStorageVersion();
      setCreateFolderSuccess({
        message: `Saved ${data.files_saved ?? favoritedAssetIdsForFolder.length} photo${(data.files_saved ?? 0) !== 1 ? "s" : ""} to Gallery Media → ${galleryTitle} → favorites`,
      });
      setTimeout(() => setCreateFolderSuccess(null), 5000);
    } catch (err) {
      setCreateFolderError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const typeFilteredAssets =
    filter === "favorited"
      ? assets.filter((a) => favoritedAssetIds.has(a.id))
      : filter === "commented"
        ? assets.filter((a) => commentedAssetIds.has(a.id))
        : assets;

  const filteredAssets =
    selectedListAssetIds !== null
      ? typeFilteredAssets.filter((a) => selectedListAssetIds.has(a.id))
      : typeFilteredAssets;

  const exportIds = () => {
    const ids = filteredAssets.map((a) => a.id).join("\n");
    navigator.clipboard.writeText(ids);
    setCopiedIds(true);
    setTimeout(() => setCopiedIds(false), 2000);
  };

  return (
    <>
      <TopBar title="Proofing" />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <DashboardRouteFade ready={!loading} srOnlyMessage="Loading proofing">
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            href={`/enterprise/galleries/${id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {galleryTitle}
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Proofing activity
            </h1>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
                {(["all", "favorited", "commented"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize ${
                      filter === f
                        ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                        : "text-neutral-600 dark:text-neutral-400"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={exportIds}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
              >
                {copiedIds ? (
                  <>
                    <Check className="h-4 w-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    Export IDs
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleDownloadFavorites}
                disabled={favoritedDownloadItems.length === 0 || isDownloadingFavorites}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50 dark:border-neutral-700 dark:bg-bizzi-blue dark:hover:bg-bizzi-cyan"
              >
                {isDownloadingFavorites ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Downloading…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Download Favorited Photos
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleCreateFavoriteFolder}
                disabled={favoritedAssetIdsForFolder.length === 0 || isCreatingFolder}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                {isCreatingFolder ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4" />
                    Create Favorite Folder
                  </>
                )}
              </button>
            </div>
            {(downloadError || createFolderError) && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {downloadError ?? createFolderError}
              </p>
            )}
            {createFolderSuccess && (
              <p className="text-sm text-green-600 dark:text-green-400">
                {createFolderSuccess.message}
              </p>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <Heart className="h-5 w-5 text-red-500" />
                Favorites lists ({favorites.length})
              </h2>
              {favorites.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No favorites submitted yet.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedListId(null)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedListId === null
                          ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-600 dark:text-white"
                          : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
                      }`}
                    >
                      All lists
                    </button>
                  </div>
                  {favorites.map((f) => {
                    const isSelected = selectedListId === f.id;
                    const label = f.client_name || f.client_email || "Anonymous";
                    const dateStr = f.created_at
                      ? new Date(f.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "";
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() =>
                          setSelectedListId(isSelected ? null : f.id)
                        }
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          isSelected
                            ? "border-bizzi-blue bg-bizzi-blue/5 ring-2 ring-bizzi-blue/50 dark:border-bizzi-cyan dark:bg-bizzi-blue/10 dark:ring-bizzi-cyan/50"
                            : "border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/50"
                        }`}
                      >
                        <p className="font-medium text-neutral-900 dark:text-white">
                          {label}
                          {dateStr && (
                            <span className="ml-1.5 font-normal text-neutral-500 dark:text-neutral-400">
                              · {dateStr}
                            </span>
                          )}
                        </p>
                        {f.client_email && f.client_name !== f.client_email && (
                          <p className="text-xs text-neutral-500">{f.client_email}</p>
                        )}
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                          {f.asset_ids.length} photo{f.asset_ids.length !== 1 ? "s" : ""} selected
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <MessageCircle className="h-5 w-5 text-bizzi-blue" />
                Comments ({comments.length})
              </h2>
              {comments.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No comments yet.
                </p>
              ) : (
                <div className="max-h-64 space-y-3 overflow-y-auto">
                  {comments.map((c) => {
                    const asset = assets.find((a) => a.id === c.asset_id);
                    return (
                      <div
                        key={c.id}
                        className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                      >
                        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                          on {asset?.name ?? c.asset_id}
                        </p>
                        <p className="font-medium text-neutral-900 dark:text-white">
                          {c.client_name || c.client_email || "Anonymous"}
                        </p>
                        <p className="text-sm text-neutral-700 dark:text-neutral-300">{c.body}</p>
                        <p className="text-xs text-neutral-400">
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Assets ({filteredAssets.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-700">
                    <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      Asset
                    </th>
                    <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      Favorited
                    </th>
                    <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      Comments
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssets.map((a) => (
                    <tr
                      key={a.id}
                      className="border-b border-neutral-100 dark:border-neutral-800"
                    >
                      <ProofingAssetCell galleryId={id} asset={a} />
                      <td className="px-4 py-3">
                        {favoritedAssetIds.has(a.id) ? (
                          <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {commentedAssetIds.has(a.id)
                          ? comments.filter((c) => c.asset_id === a.id).length
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </DashboardRouteFade>
      </main>
    </>
  );
}
