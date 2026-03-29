"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Heart,
  MessageCircle,
  Loader2,
  Download,
  FolderPlus,
  Film,
  ExternalLink,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useGalleryBulkDownload } from "@/hooks/useGalleryBulkDownload";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import { ProofingAssetCell } from "@/components/gallery/ProofingAssetCell";
import { ProofingClipReviewModal } from "@/components/gallery/ProofingClipReviewModal";
import type { ViewGalleryLike } from "@/lib/gallery-dashboard-lut-preview";
import { resolveProofingGridLutMirror } from "@/lib/gallery-viewer-lut-state";
import { normalizeGalleryMediaMode } from "@/lib/gallery-media-mode";
import type { GalleryPolicyLike } from "@/lib/video-gallery-client-policy";
import {
  clientMayDownloadFiles,
  clientMayDownloadGalleryFiles,
  getVideoDeliverySummary,
  isCommentsAllowed,
  isFavoritesAllowed,
} from "@/lib/video-gallery-client-policy";

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
  duration?: number | null;
  is_downloadable?: boolean | null;
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function sortCommentsDesc(a: Comment, b: Comment): number {
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return tb - ta;
}

export type GalleryProofingWorkspaceProps = {
  galleryId: string;
  /** e.g. `/dashboard/galleries/x` or `/enterprise/galleries/x` */
  galleryDetailHref: string;
  /** Redirect when gallery missing */
  galleriesListHref: string;
};

export default function GalleryProofingWorkspace({
  galleryId,
  galleryDetailHref,
  galleriesListHref,
}: GalleryProofingWorkspaceProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [galleryTitle, setGalleryTitle] = useState("");
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [favorites, setFavorites] = useState<FavoritesList[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "favorited" | "commented">("all");
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [lutMirrorGallery, setLutMirrorGallery] = useState<ViewGalleryLike | null>(null);
  const [policyGallery, setPolicyGallery] = useState<GalleryPolicyLike | null>(null);
  const [reviewAsset, setReviewAsset] = useState<GalleryAsset | null>(null);

  const { bumpStorageVersion } = useBackup();
  const { selectedWorkspaceId } = useCurrentFolder();

  const lutMirror = useMemo(
    () =>
      resolveProofingGridLutMirror(
        galleryId,
        lutMirrorGallery,
        lutMirrorGallery?.viewer_lut_preferences
      ),
    [galleryId, lutMirrorGallery]
  );

  const isVideo = policyGallery?.gallery_type === "video";
  const mediaMode = normalizeGalleryMediaMode({
    media_mode: (policyGallery?.media_mode as string) ?? null,
    source_format: policyGallery?.source_format ?? null,
  });

  const policyFavorites = isFavoritesAllowed(policyGallery);
  const policyComments = isCommentsAllowed(policyGallery);
  const policyDownloads = clientMayDownloadGalleryFiles(policyGallery);
  const videoSummary = getVideoDeliverySummary(policyGallery);

  const fetchData = useCallback(async () => {
    if (!user || !galleryId) return;
    try {
      const token = await user.getIdToken();
      const [viewRes, favRes, commentsRes] = await Promise.all([
        fetch(`/api/galleries/${galleryId}/view`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/galleries/${galleryId}/favorites`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/galleries/${galleryId}/comments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!viewRes.ok) {
        if (viewRes.status === 404) router.replace(galleriesListHref);
        return;
      }

      const viewData = await viewRes.json();
      setGalleryTitle(viewData.gallery?.title ?? "Gallery");
      setAssets(viewData.assets ?? []);
      setLutMirrorGallery(viewData.gallery ?? null);
      setPolicyGallery((viewData.gallery ?? null) as GalleryPolicyLike);

      if (favRes.ok) {
        const favData = await favRes.json();
        setFavorites(favData.lists ?? []);
      }

      if (commentsRes.ok) {
        const commentsData = await commentsRes.json();
        setComments(commentsData.comments ?? []);
      }
    } catch {
      router.replace(galleriesListHref);
    } finally {
      setLoading(false);
    }
  }, [user, galleryId, router, galleriesListHref]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const getAuthToken = useCallback(async () => (user ? user.getIdToken() : null), [user]);

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
          VIDEO_EXT.test(a.name)) &&
        clientMayDownloadFiles(policyGallery, a.is_downloadable)
    )
    .map((a) => ({ object_key: a.object_key!, name: a.name }));

  const {
    download: downloadFavorites,
    isLoading: isDownloadingFavorites,
    error: downloadError,
  } = useGalleryBulkDownload({ galleryId, user, password: null });

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createFolderError, setCreateFolderError] = useState<string | null>(null);
  const [createFolderSuccess, setCreateFolderSuccess] = useState<{ message: string } | null>(
    null
  );

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

  const unit = isVideo ? "clip" : "photo";
  const units = isVideo ? "clips" : "photos";

  const handleDownloadFavorites = () => {
    if (!policyFavorites || !policyDownloads) return;
    if (favoritedDownloadItems.length === 0) return;
    downloadFavorites(favoritedDownloadItems, "selected");
  };

  const handleCreateFavoriteFolder = async () => {
    if (!policyFavorites) return;
    if (favoritedAssetIdsForFolder.length === 0) return;
    setIsCreatingFolder(true);
    setCreateFolderError(null);
    setCreateFolderSuccess(null);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/galleries/${galleryId}/create-favorite-folder`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          asset_ids: favoritedAssetIdsForFolder,
          ...(selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        files_saved?: number;
        files_skipped?: number;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to create folder");
      }
      bumpStorageVersion();
      const saved = data.files_saved ?? 0;
      const skipped = data.files_skipped ?? 0;
      let message: string;
      if (saved === 0 && skipped > 0) {
        message = `All ${skipped} selected ${units} are already in Favorites for this gallery in the current workspace.`;
      } else if (skipped > 0) {
        message = `Saved ${saved} ${saved === 1 ? unit : units} to Gallery Media → ${galleryTitle} → Favorites (${skipped} already there).`;
      } else {
        message = `Saved ${saved} ${saved === 1 ? unit : units} to Gallery Media → ${galleryTitle} → Favorites`;
      }
      setCreateFolderSuccess({ message });
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

  const filterLabels: Record<typeof filter, string> = isVideo
    ? { all: "All clips", favorited: "Favorited", commented: "Commented" }
    : { all: "All", favorited: "Favorited", commented: "Commented" };

  const workflowChip = policyGallery?.workflow_status
    ? String(policyGallery.workflow_status).replace(/_/g, " ")
    : null;

  return (
    <>
      <TopBar title="Proofing" />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <DashboardRouteFade ready={!loading} srOnlyMessage="Loading proofing">
          <div className="mx-auto max-w-6xl space-y-6">
            <Link
              href={galleryDetailHref}
              className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to {galleryTitle}
            </Link>

            {isVideo && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-1 font-medium dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  <Film className="h-3.5 w-3.5" />
                  Video
                </span>
                <span className="rounded-full border border-neutral-200 px-2.5 py-1 dark:border-neutral-600">
                  {mediaMode === "raw" ? "RAW" : "Final"}
                </span>
                {workflowChip ? (
                  <span className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-neutral-500 dark:border-neutral-500 dark:text-neutral-500">
                    {workflowChip}
                  </span>
                ) : null}
              </div>
            )}

            {isVideo && videoSummary.lines.length > 0 && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 px-4 py-3 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900/60 dark:text-neutral-300">
                <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                  Review summary
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
                  <li>
                    {assets.length} clip{assets.length !== 1 ? "s" : ""} · {favoritedAssetIds.size}{" "}
                    in selects · {commentedAssetIds.size} with comments
                  </li>
                  {videoSummary.lines.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-4">
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Proofing activity
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
                  {(["all", "favorited", "commented"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        filter === f
                          ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                          : "text-neutral-600 dark:text-neutral-400"
                      }`}
                    >
                      {filterLabels[f]}
                    </button>
                  ))}
                </div>
                {policyFavorites && policyDownloads ? (
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
                        {isVideo ? "Download favorited clips" : "Download favorited photos"}
                      </>
                    )}
                  </button>
                ) : null}
                {policyFavorites ? (
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
                        {isVideo ? "Create favorites folder" : "Create Favorite Folder"}
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {!policyDownloads && policyFavorites && (
                <p className="w-full text-xs text-neutral-500 dark:text-neutral-500">
                  Downloads are off or blocked by invoice for this gallery — favorited zip is hidden.
                </p>
              )}
              {!policyFavorites && (
                <p className="w-full text-xs text-neutral-500 dark:text-neutral-500">
                  Favorites are disabled for this gallery — download and folder actions are hidden.
                </p>
              )}
              {(downloadError || createFolderError) && (
                <p className="w-full text-sm text-red-600 dark:text-red-400">
                  {downloadError ?? createFolderError}
                </p>
              )}
              {createFolderSuccess && (
                <p className="w-full text-sm text-green-600 dark:text-green-400">
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
                          onClick={() => setSelectedListId(isSelected ? null : f.id)}
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
                            {f.asset_ids.length} {f.asset_ids.length !== 1 ? units : unit} selected
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
                  {!policyComments && (
                    <span className="text-xs font-normal text-neutral-500">(disabled for clients)</span>
                  )}
                </h2>
                {comments.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">No comments yet.</p>
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
                  {isVideo ? "Clips" : "Assets"} ({filteredAssets.length})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 dark:border-neutral-700">
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                        {isVideo ? "Clip" : "Asset"}
                      </th>
                      {isVideo ? (
                        <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                          Duration
                        </th>
                      ) : null}
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                        Favorited
                      </th>
                      <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                        Comments
                      </th>
                      {isVideo ? (
                        <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                          Latest
                        </th>
                      ) : null}
                      {isVideo ? (
                        <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                          Open
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map((a) => {
                      const latestComment: Comment | undefined = isVideo
                        ? [...comments]
                            .filter((c) => c.asset_id === a.id)
                            .sort(sortCommentsDesc)[0]
                        : undefined;
                      return (
                        <tr
                          key={a.id}
                          className="border-b border-neutral-100 dark:border-neutral-800"
                        >
                          <ProofingAssetCell galleryId={galleryId} asset={a} lutMirror={lutMirror} />
                          {isVideo ? (
                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-600 dark:text-neutral-400">
                              {formatDuration(a.duration)}
                            </td>
                          ) : null}
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
                          {isVideo ? (
                            <td className="max-w-[200px] truncate px-4 py-3 text-neutral-600 dark:text-neutral-400">
                              {latestComment?.body ?? "—"}
                            </td>
                          ) : null}
                          {isVideo && VIDEO_EXT.test(a.name) ? (
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => setReviewAsset(a)}
                                className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs font-medium text-bizzi-blue hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Review
                              </button>
                            </td>
                          ) : isVideo ? (
                            <td className="px-4 py-3 text-neutral-300">—</td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DashboardRouteFade>
      </main>

      <ProofingClipReviewModal
        galleryId={galleryId}
        asset={reviewAsset}
        comments={
          reviewAsset
            ? comments.filter((c) => c.asset_id === reviewAsset.id).sort(sortCommentsDesc)
            : []
        }
        onClose={() => setReviewAsset(null)}
        getAuthToken={getAuthToken}
      />
    </>
  );
}
