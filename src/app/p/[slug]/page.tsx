"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Images, Loader2 } from "lucide-react";
import { GALLERY_IMAGE_EXT, GALLERY_VIDEO_EXT } from "@/lib/gallery-file-types";

interface StudioGallery {
  id: string;
  title: string;
  slug: string;
  cover_object_key: string | null;
  cover_name: string | null;
  description: string | null;
  event_date: string | null;
  branding: Record<string, unknown>;
  created_at: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function StudioGalleryCard({ gallery, handle }: { gallery: StudioGallery; handle: string }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const thumbRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gallery.cover_object_key || !gallery.cover_name) return;
    const isImage = GALLERY_IMAGE_EXT.test(gallery.cover_name);
    const isVideo = GALLERY_VIDEO_EXT.test(gallery.cover_name);
    if (!isImage && !isVideo) return;
    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          object_key: gallery.cover_object_key!,
          name: gallery.cover_name!,
          size: "cover-sm",
        });
        const url =
          isVideo
            ? `/api/galleries/${gallery.id}/video-thumbnail?${params}`
            : `/api/galleries/${gallery.id}/thumbnail?${params}`;
        const res = await fetch(url);
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
  }, [gallery.id, gallery.cover_object_key, gallery.cover_name]);

  const href = handle && gallery.slug ? `/${encodeURIComponent(handle)}/${encodeURIComponent(gallery.slug)}` : `/g/${gallery.id}`;

  return (
    <Link
      href={href}
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition-colors hover:border-bizzi-blue/40 hover:shadow-md dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-cyan/40"
    >
      <div className="relative flex aspect-video shrink-0 items-center justify-center overflow-hidden rounded-t-xl bg-neutral-100 dark:bg-neutral-800">
        {thumbUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <Images className="h-12 w-12 text-neutral-300 dark:text-neutral-600" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {gallery.event_date && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {formatDate(gallery.event_date)}
          </p>
        )}
        <h3 className="truncate font-medium text-neutral-900 dark:text-white">
          {gallery.title}
        </h3>
        {gallery.description && (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-500 dark:text-neutral-400">
            {gallery.description}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function StudioHomepagePage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [data, setData] = useState<{
    business_name: string | null;
    logo_url: string | null;
    galleries: StudioGallery[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/studios/${encodeURIComponent(slug)}/galleries`);
        if (cancelled) return;
        const body = await res.json();
        if (!res.ok) {
          setError(body.error ?? "Studio not found");
          return;
        }
        setData({
          business_name: body.business_name ?? null,
          logo_url: body.logo_url ?? null,
          galleries: body.galleries ?? [],
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
        <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
          Loading…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <Images className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          Studio not found
        </h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This page does not exist."}
        </p>
        <Link href="/" className="text-bizzi-blue hover:text-bizzi-cyan">
          Go home
        </Link>
      </div>
    );
  }

  const { business_name, logo_url, galleries } = data;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              {business_name || "Gallery"}
            </span>
          </Link>
          {logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={logo_url}
              alt=""
              className="h-8 w-8 rounded-full object-cover"
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 text-2xl font-semibold text-neutral-900 dark:text-white">
          {business_name ? `${business_name}'s galleries` : "Galleries"}
        </h1>

        {galleries.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white py-16 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <Images className="mx-auto mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
            <p className="text-neutral-500 dark:text-neutral-400">
              No galleries yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {galleries.map((g) => (
              <StudioGalleryCard key={g.id} gallery={g} handle={slug} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
