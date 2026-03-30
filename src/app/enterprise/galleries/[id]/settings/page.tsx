"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import GallerySettingsForm from "@/components/gallery/GallerySettingsForm";
import SettingsScopeHeader from "@/components/settings/SettingsScopeHeader";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import type { CoverPosition, VideoDeliveryMode, VideoWorkflowStatus } from "@/types/gallery";

const BASE_PATH = "/enterprise";

interface GalleryData {
  id: string;
  version?: number;
  title: string;
  description?: string | null;
  event_date?: string | null;
  expiration_date?: string | null;
  access_mode: string;
  invited_emails: string[];
  invite_sent_to?: string[];
  layout: string;
  cover_asset_id?: string | null;
  share_image_asset_id?: string | null;
  cover_position?: CoverPosition | null;
  cover_focal_x?: number | null;
  cover_focal_y?: number | null;
  cover_alt_text?: string | null;
  cover_overlay_opacity?: number | null;
  cover_title_alignment?: "left" | "center" | "right" | null;
  cover_hero_height?: "small" | "medium" | "large" | "cinematic" | "fullscreen" | null;
  branding: Record<string, unknown>;
  download_settings: Record<string, unknown>;
  watermark: Record<string, unknown>;
  lut?: { enabled?: boolean; storage_url?: string | null } | null;
  gallery_type?: "photo" | "video";
  media_mode?: "final" | "raw";
  source_format?: "raw" | "jpg";
  delivery_mode?: VideoDeliveryMode | null;
  allow_comments?: boolean;
  allow_favorites?: boolean;
  client_review_instructions?: string | null;
  workflow_status?: VideoWorkflowStatus | null;
  featured_video_asset_id?: string | null;
  slug?: string;
  owner_handle?: string | null;
}

export default function EnterpriseGallerySettingsPage() {
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
        if (res.status === 404) router.replace(`${BASE_PATH}/galleries`);
        return;
      }
      const data = await res.json();
      setGallery(data);
    } catch {
      router.replace(`${BASE_PATH}/galleries`);
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

  return (
    <>
      <TopBar title="Gallery settings" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardRouteFade ready={!loading && !!gallery} srOnlyMessage="Loading gallery settings">
        {gallery ? (
        <div className="mx-auto max-w-5xl space-y-6">
          <Link
            href={`${BASE_PATH}/galleries/${id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to {gallery.title}
          </Link>
          <SettingsScopeHeader
            title="Gallery settings"
            scope="gallery"
            permission={{ kind: "editable" }}
            effectSummary={`${productSettingsCopy.scopes.thisGalleryOnly} — ${productSettingsCopy.scopes.organizationWide} context.`}
          />
          <GallerySettingsForm
            galleryId={id}
            initialData={gallery}
            onRefetch={fetchGallery}
          />
        </div>
        ) : null}
        </DashboardRouteFade>
      </main>
    </>
  );
}
