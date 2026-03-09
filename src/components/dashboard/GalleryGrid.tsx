"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Images,
  ExternalLink,
  BarChart2,
  Trash2,
  Lock,
  Key,
  Mail,
  Plus,
} from "lucide-react";
import { useGalleries } from "@/hooks/useGalleries";
import { useConfirm } from "@/hooks/useConfirm";
import { useGalleryThumbnail } from "@/hooks/useGalleryThumbnail";
import { useInView } from "@/hooks/useInView";
import CreateGalleryModal from "./CreateGalleryModal";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExpires(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d < new Date() ? "Expired" : formatDate(iso);
}

function accessIcon(access: string) {
  switch (access) {
    case "password":
      return <Lock className="h-4 w-4 text-amber-500" />;
    case "pin":
      return <Key className="h-4 w-4 text-amber-500" />;
    case "invite_only":
      return <Mail className="h-4 w-4 text-amber-500" />;
    default:
      return null;
  }
}

type GalleryCardProps = {
  gallery: {
    id: string;
    title: string;
    access_mode: string;
    view_count: number;
    download_count: number;
    expiration_date: string | null;
    cover_object_key: string | null;
    cover_name: string | null;
  };
  onDelete: (e: React.MouseEvent, g: { id: string; title: string }) => void;
  deletingId: string | null;
};

function GalleryCard({ gallery: g, onDelete, deletingId }: GalleryCardProps) {
  const [cardRef, isInView] = useInView<HTMLDivElement>();
  const thumbUrl = useGalleryThumbnail(
    g.cover_object_key ? g.id : undefined,
    g.cover_object_key ?? undefined,
    g.cover_name ?? "",
    { enabled: !!g.cover_object_key && isInView, size: "cover-sm" }
  );

  return (
    <Link
      href={`/dashboard/galleries/${g.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-bizzi-blue/40 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-cyan/40"
    >
      <div
        ref={cardRef}
        className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100 dark:bg-neutral-800"
      >
        {thumbUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URL from gallery thumbnail API */}
            <img
              src={thumbUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          </>
        ) : (
          <Images className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="truncate font-medium text-neutral-900 dark:text-white">
            {g.title}
          </h3>
          {accessIcon(g.access_mode)}
        </div>
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="flex items-center gap-1">
            <BarChart2 className="h-3.5 w-3.5" />
            {g.view_count} views
          </span>
          <span>{g.download_count} downloads</span>
        </div>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          Expires {formatExpires(g.expiration_date)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2">
          <a
            href={`/g/${g.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs font-medium text-bizzi-blue hover:text-bizzi-cyan dark:text-bizzi-cyan"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View gallery
          </a>
          <button
            type="button"
            onClick={(e) => onDelete(e, g)}
            disabled={deletingId === g.id}
            className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 disabled:opacity-50"
            aria-label="Delete gallery"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Link>
  );
}

export default function GalleryGrid() {
  const { galleries, loading, error, createGallery, deleteGallery } = useGalleries();
  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm } = useConfirm();

  const handleDelete = async (e: React.MouseEvent, g: { id: string; title: string }) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirm({
      message: `Delete gallery "${g.title}"? This cannot be undone.`,
      destructive: true,
    });
    if (!ok) return;
    setDeletingId(g.id);
    try {
      await deleteGallery(g.id);
    } catch (err) {
      console.error("Delete gallery failed:", err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async (input: Parameters<typeof createGallery>[0]) => {
    const created = await createGallery(input);
    if (created?.id) {
      window.location.href = `/dashboard/galleries/${created.id}`;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Images className="h-12 w-12 animate-pulse text-neutral-300 dark:text-neutral-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-neutral-900 dark:text-white">
          Client galleries
        </h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          <Plus className="h-4 w-4" />
          New gallery
        </button>
      </div>

      {galleries.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 dark:border-neutral-700">
          <Images className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
          <p className="mb-1 text-lg font-medium text-neutral-700 dark:text-neutral-300">
            No galleries yet
          </p>
          <p className="mb-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Create a client gallery to deliver photos with proofing, downloads, and branding.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            <Plus className="h-4 w-4" />
            Create your first gallery
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {galleries.map((g) => (
            <GalleryCard key={g.id} gallery={g} onDelete={handleDelete} deletingId={deletingId} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGalleryModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
