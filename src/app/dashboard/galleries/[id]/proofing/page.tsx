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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopBar from "@/components/dashboard/TopBar";
import GalleryAssetThumbnail from "@/components/gallery/GalleryAssetThumbnail";
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
  proofing_status?: string;
}

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|tiff?|heic)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v|avi)$/i;

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
  const objectKey = asset.object_key ?? "";
  const isImage = IMAGE_EXT.test(asset.name);
  const isVideo = VIDEO_EXT.test(asset.name);
  const previewUrl = useGalleryThumbnail(galleryId, objectKey, asset.name, {
    enabled: (isImage || isVideo) && isHovered,
    size: "medium",
  });

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
        left: coords.x + 16,
        top: coords.y,
        width: 280,
        height: 280,
      }}
    >
      <div
        className="h-full w-full overflow-hidden rounded-xl border-2 border-white bg-neutral-900 shadow-2xl ring-2 ring-neutral-500/30"
        style={{ animation: "proofing-popup 0.2s ease-out" }}
      >
        {previewUrl ? (
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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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
  const [copiedIds, setCopiedIds] = useState(false);

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
        if (viewRes.status === 404) router.replace("/dashboard/galleries");
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
      router.replace("/dashboard/galleries");
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

  const filteredAssets =
    filter === "favorited"
      ? assets.filter((a) => favoritedAssetIds.has(a.id))
      : filter === "commented"
        ? assets.filter((a) => commentedAssetIds.has(a.id))
        : assets;

  const exportIds = () => {
    const ids = filteredAssets.map((a) => a.id).join("\n");
    navigator.clipboard.writeText(ids);
    setCopiedIds(true);
    setTimeout(() => setCopiedIds(false), 2000);
  };

  const updateProofingStatus = async (assetId: string, status: string) => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}/assets/${assetId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofing_status: status }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error("Update proofing status failed:", err);
    }
  };

  if (loading) {
    return (
      <>
        <TopBar title="Proofing" />
        <main className="flex flex-1 items-center justify-center p-6">
          <Loader2 className="h-10 w-10 animate-spin text-neutral-400" />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Proofing" />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <Link
            href={`/dashboard/galleries/${id}`}
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
            </div>
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
                  {favorites.map((f) => (
                    <div
                      key={f.id}
                      className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-700"
                    >
                      <p className="font-medium text-neutral-900 dark:text-white">
                        {f.client_name || f.client_email || "Anonymous"}
                      </p>
                      {f.client_email && f.client_name !== f.client_email && (
                        <p className="text-xs text-neutral-500">{f.client_email}</p>
                      )}
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        {f.asset_ids.length} photo{f.asset_ids.length !== 1 ? "s" : ""} selected
                      </p>
                      <p className="text-xs text-neutral-400">
                        {f.created_at
                          ? new Date(f.created_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : ""}
                      </p>
                    </div>
                  ))}
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
                    <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">
                      Status
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
                      <td className="px-4 py-3">
                        <select
                          value={a.proofing_status ?? "pending"}
                          onChange={(e) =>
                            updateProofingStatus(a.id, e.target.value)
                          }
                          className="rounded border border-neutral-200 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                        >
                          <option value="pending">Pending</option>
                          <option value="selected">Selected</option>
                          <option value="editing">Editing</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
