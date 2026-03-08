"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ExternalLink,
  Plus,
  Image as ImageIcon,
  Film,
  Copy,
  Check,
  Loader2,
  FolderOpen,
  Settings,
  Heart,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import TopBar from "@/components/dashboard/TopBar";
import GalleryUploadZone from "@/components/gallery/GalleryUploadZone";

interface GalleryData {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode: string;
  layout: string;
  view_count: number;
  download_count: number;
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
  const id = params?.id as string;
  const { user } = useAuth();
  const { recentFiles } = useCloudFiles();

  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [assets, setAssets] = useState<GalleryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const fetchGallery = useCallback(async () => {
    if (!user || !id) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/galleries/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) router.replace("/dashboard/galleries");
        return;
      }
      const data = await res.json();
      setGallery(data);
    } catch {
      router.replace("/dashboard/galleries");
    }
  }, [user, id, router]);

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
        body: JSON.stringify({ backup_file_ids: Array.from(selectedIds) }),
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

  const galleryUrl = typeof window !== "undefined" ? `${window.location.origin}/g/${id}` : `/g/${id}`;

  const copyLink = () => {
    navigator.clipboard.writeText(galleryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading || !gallery) {
    return (
      <>
        <TopBar title="Gallery" />
        <main className="flex flex-1 items-center justify-center p-6">
          <Loader2 className="h-10 w-10 animate-spin text-neutral-400" />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title={gallery.title} />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          <Link
            href="/dashboard/galleries"
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to galleries
          </Link>

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
                href={`/dashboard/galleries/${id}/proofing`}
                className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                <Heart className="h-4 w-4" />
                Proofing
              </Link>
              <Link
                href={`/dashboard/galleries/${id}/settings`}
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
                href={`/g/${id}`}
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
              <h2 className="font-medium text-neutral-900 dark:text-white">Assets</h2>
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
                onUploadComplete={() => {
                  fetchAssets();
                  fetchGallery();
                }}
              />
            </div>
            {assets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8">
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Upload above or add from your existing files.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 md:grid-cols-5">
                {assets.map((a) => (
                  <div
                    key={a.id}
                    className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800"
                  >
                    {a.media_type === "video" ? (
                      <Film className="h-8 w-8 text-neutral-400" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-neutral-400" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                Add photos & videos
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
            <div className="max-h-[400px] overflow-y-auto p-4">
              <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                Select from your recent files. Supported: JPEG, PNG, GIF, MP4, MOV, etc.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {recentFiles
                  .filter((f) =>
                    /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|m4v)$/i.test(f.name)
                  )
                  .slice(0, 50)
                  .map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleSelect(f.id)}
                      className={`flex aspect-square flex-col items-center justify-center rounded-lg border-2 p-2 transition-colors ${
                        selectedIds.has(f.id)
                          ? "border-bizzi-blue bg-bizzi-blue/10"
                          : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                      }`}
                    >
                      {/\.(mp4|webm|mov|m4v)$/i.test(f.name) ? (
                        <Film className="h-6 w-6 text-neutral-500" />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-neutral-500" />
                      )}
                      <span className="mt-1 truncate w-full text-center text-xs">
                        {f.name}
                      </span>
                    </button>
                  ))}
              </div>
              {recentFiles.filter((f) =>
                /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|m4v)$/i.test(f.name)
              ).length === 0 && (
                <p className="py-8 text-center text-sm text-neutral-500">
                  No supported files in recent uploads. Upload some photos or videos first.
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
