"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

export interface GalleryListItem {
  id: string;
  gallery_type: "photo" | "video";
  title: string;
  slug: string;
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

export function useGalleries() {
  const { user } = useAuth();
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
      const res = await fetch("/api/galleries", {
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
  }, [user]);

  useEffect(() => {
    fetchGalleries();
  }, [fetchGalleries]);

  const createGallery = useCallback(
    async (input: {
      gallery_type: "photo" | "video";
      title: string;
      description?: string | null;
      event_date?: string | null;
      expiration_date?: string | null;
      access_mode?: string;
      password?: string | null;
      pin?: string | null;
      invited_emails?: string[];
      layout?: string;
      source_format?: "raw" | "jpg";
      /** Video gallery specific */
      delivery_mode?: string;
      download_policy?: string;
      allow_comments?: boolean;
      allow_favorites?: boolean;
      allow_timestamp_comments?: boolean;
      allow_original_downloads?: boolean;
      allow_proxy_downloads?: boolean;
      revision_limit_enabled?: boolean;
      revision_limit_count?: number;
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
      const res = await fetch("/api/galleries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create gallery");
      await fetchGalleries();
      return data;
    },
    [user, fetchGalleries]
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
