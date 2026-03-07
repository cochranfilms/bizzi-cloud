"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ShareListItem {
  id: string;
  token: string;
  folder_name: string;
  permission: "view" | "edit";
  share_url: string;
  sharedBy?: string;
}

export interface UseSharesResult {
  owned: ShareListItem[];
  invited: ShareListItem[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useShares(): UseSharesResult {
  const { user } = useAuth();
  const [owned, setOwned] = useState<ShareListItem[]>([]);
  const [invited, setInvited] = useState<ShareListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    if (!user) {
      setOwned([]);
      setInvited([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/shares", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load shares");
      }
      const data = await res.json();
      setOwned(
        (data.owned ?? []).map((s: { id: string; token: string; folder_name: string; permission: string; share_url: string }) => ({
          id: s.id,
          token: s.token,
          folder_name: s.folder_name,
          permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
          share_url: s.share_url,
          sharedBy: "You",
        }))
      );
      setInvited(
        (data.invited ?? []).map((s: { id: string; token: string; folder_name: string; permission: string; share_url: string; sharedBy?: string }) => ({
          id: s.id,
          token: s.token,
          folder_name: s.folder_name,
          permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
          share_url: s.share_url,
          sharedBy: s.sharedBy ?? "Someone",
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shares");
      setOwned([]);
      setInvited([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchShares();
  }, [fetchShares]);

  return { owned, invited, loading, error, refetch: fetchShares };
}
