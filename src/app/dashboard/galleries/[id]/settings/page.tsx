"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Loader2, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopBar from "@/components/dashboard/TopBar";
import GallerySettingsForm from "@/components/gallery/GallerySettingsForm";
import type { CoverPosition } from "@/types/gallery";

interface GalleryData {
  id: string;
  title: string;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode: string;
  invited_emails: string[];
  layout: string;
  cover_asset_id?: string | null;
  cover_position?: CoverPosition | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  branding: Record<string, unknown>;
  download_settings: Record<string, unknown>;
  watermark: Record<string, unknown>;
}

export default function GallerySettingsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { user } = useAuth();
  const [gallery, setGallery] = useState<GalleryData | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (!user || !id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchGallery().finally(() => setLoading(false));
  }, [user, id, fetchGallery]);

  if (loading || !gallery) {
    return (
      <>
        <TopBar title="Gallery settings" />
        <main className="flex flex-1 items-center justify-center p-6">
          <Loader2 className="h-10 w-10 animate-spin text-neutral-400" />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Gallery settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link
            href={`/dashboard/galleries/${id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {gallery.title}
          </Link>
          <GallerySettingsForm galleryId={id} initialData={gallery} />
        </div>
      </main>
    </>
  );
}
