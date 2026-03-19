"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ShareListItem {
  id: string;
  token: string;
  folder_name: string;
  item_type: "file" | "folder";
  permission: "view" | "edit";
  share_url: string;
  sharedBy?: string;
  owner_id?: string;
  sharedByEmail?: string;
  sharedByPhotoUrl?: string;
  invited_emails?: string[];
}

export interface UseSharesResult {
  owned: ShareListItem[];
  invited: ShareListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Delete a share (owner only). Removes the share record; original files stay. */
  deleteShare: (token: string) => Promise<void>;
}

export function useShares(): UseSharesResult {
  const { user } = useAuth();
  const [owned, setOwned] = useState<ShareListItem[]>([]);
  const [invited, setInvited] = useState<ShareListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);

  const fetchShares = useCallback(async () => {
    if (!user) {
      setOwned([]);
      setInvited([]);
      setLoading(false);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/shares", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load shares");
      }
      const data = await res.json();
      setOwned(
        (data.owned ?? []).map((s: { id: string; token: string; folder_name: string; item_type?: string; permission: string; share_url: string; invited_emails?: string[] }) => ({
          id: s.id,
          token: s.token,
          folder_name: s.folder_name,
          item_type: s.item_type === "file" ? "file" : "folder",
          permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
          share_url: s.share_url,
          sharedBy: "You",
          invited_emails: Array.isArray(s.invited_emails) ? s.invited_emails : [],
        }))
      );
      setInvited(
        (data.invited ?? []).map((s: { id: string; token: string; folder_name: string; item_type?: string; permission: string; share_url: string; sharedBy?: string; owner_id?: string; sharedByEmail?: string; sharedByPhotoUrl?: string }) => ({
          id: s.id,
          token: s.token,
          folder_name: s.folder_name,
          item_type: s.item_type === "file" ? "file" : "folder",
          permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
          share_url: s.share_url,
          sharedBy: s.sharedBy ?? "Someone",
          owner_id: s.owner_id,
          sharedByEmail: s.sharedByEmail,
          sharedByPhotoUrl: s.sharedByPhotoUrl,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shares");
      setOwned([]);
      setInvited([]);
    } finally {
      fetchingRef.current = false;
      setLoading(false);
    }
  }, [user]);

  const deleteShare = useCallback(
    async (token: string) => {
      if (!user) return;
      const idToken = await user.getIdToken(true);
      const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete share");
      }
      await fetchShares();
    },
    [user, fetchShares]
  );

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  return { owned, invited, loading, error, refetch: fetchShares, deleteShare };
}
