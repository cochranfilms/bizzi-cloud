"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";

export interface GalleryListItem {
  id: string;
  gallery_type: "photo" | "video";
  /** final = delivery-ready; raw = source / LUT review */
  media_mode?: "final" | "raw";
  title: string;
  slug: string;
  media_folder_segment?: string | null;
  photographer_id: string;
  cover_asset_id: string | null;
  cover_object_key: string | null;
  cover_name: string | null;
  description: string | null;
  event_date: string | null;
  expiration_date: string | null;
  access_mode: string;
  layout: string;
  view_count: number;
  unique_visitor_count: number;
  favorite_count: number;
  download_count: number;
  created_at: string;
  updated_at: string;
}

export function useGalleries(options?: { basePath?: string }) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const basePath = options?.basePath ?? "";
  const isEnterprise = basePath === "/enterprise";
  const teamOwnerFromBase = /^\/team\/([^/]+)/.exec(basePath)?.[1]?.trim() ?? null;
  const isPersonalTeam = !!teamOwnerFromBase;
  const [galleries, setGalleries] = useState<GalleryListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGalleries = useCallback(async () => {
    if (!user) {
      setGalleries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (isEnterprise && org?.id) {
        params.set("context", "enterprise");
        params.set("organization_id", org.id);
      } else if (isPersonalTeam && teamOwnerFromBase) {
        params.set("context", "personal_team");
        params.set("team_owner_user_id", teamOwnerFromBase);
      }
      const url = params.toString() ? `/api/galleries?${params.toString()}` : "/api/galleries";
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load galleries");
      setGalleries(data.galleries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setGalleries([]);
    } finally {
      setLoading(false);
    }
  }, [user, isEnterprise, org?.id, isPersonalTeam, teamOwnerFromBase]);

  useEffect(() => {
    fetchGalleries();
  }, [fetchGalleries]);

  const createGallery = useCallback(
    async (input: {
      gallery_type: "photo" | "video";
      organization_id?: string | null;
      title: string;
      description?: string | null;
      event_date?: string | null;
      expiration_date?: string | null;
      access_mode?: string;
      password?: string | null;
      pin?: string | null;
      invited_emails?: string[];
      layout?: string;
      media_mode?: "final" | "raw";
      /** @deprecated use media_mode */
      source_format?: "raw" | "jpg";
      /** Video gallery specific */
      delivery_mode?: string;
      download_policy?: string;
      allow_comments?: boolean;
      allow_favorites?: boolean;
      allow_timestamp_comments?: boolean;
      allow_original_downloads?: boolean;
      allow_proxy_downloads?: boolean;
      invoice_mode?: "external_link" | "manual" | null;
      invoice_url?: string | null;
      invoice_label?: string | null;
      invoice_status?: string | null;
      invoice_required_for_download?: boolean;
      featured_video_asset_id?: string | null;
      client_review_instructions?: string | null;
      workflow_status?: string | null;
    }) => {
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      const body = {
        ...input,
        organization_id: isEnterprise && org?.id ? org.id : null,
        ...(isPersonalTeam && teamOwnerFromBase
          ? { personal_team_owner_id: teamOwnerFromBase }
          : {}),
      };
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create gallery");
      await fetchGalleries();
      return data;
    },
    [user, fetchGalleries, isEnterprise, org?.id, isPersonalTeam, teamOwnerFromBase]
  );

  const deleteGallery = useCallback(
    async (id: string, options?: { deleteFiles?: boolean }) => {
      if (!user) throw new Error("Not authenticated");
      const token = await user.getIdToken();
      const url = new URL(`/api/galleries/${id}`, typeof window !== "undefined" ? window.location.origin : "");
      if (options?.deleteFiles) url.searchParams.set("deleteFiles", "true");
      const res = await fetch(url.toString(), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete");
      }
      await fetchGalleries();
    },
    [user, fetchGalleries]
  );

  return { galleries, loading, error, fetchGalleries, createGallery, deleteGallery };
}
