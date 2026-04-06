"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";

export interface ShareListItem {
  id: string;
  token: string;
  folder_name: string;
  /** Custom share title from Firestore when the owner typed one */
  share_label?: string;
  backing_item_name?: string;
  /** Resolved team/org name for workspace-targeted shares */
  workspace_display_name?: string;
  item_type: "file" | "folder";
  permission: "view" | "edit";
  share_url: string;
  sharedBy?: string;
  owner_id?: string;
  sharedByEmail?: string;
  sharedByPhotoUrl?: string;
  invited_emails?: string[];
  recipient_mode?: string;
  workspace_target?: { kind: string; id: string };
  workspace_target_key?: string;
  /** Workspace-targeted shares: badge for Sent list */
  share_destination?: "team" | "organization";
  /** Workspace inbox: pending until admin approves cross-workspace delivery */
  workspace_delivery_status?: string | null;
}

export interface SharesListQuery {
  context: "personal" | "workspace";
  workspace_kind?: "enterprise_workspace" | "personal_team";
  workspace_id?: string;
  organization_id?: string;
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

function destinationFromShareRow(s: {
  recipient_mode?: string;
  workspace_target?: { kind: string; id: string };
}): "team" | "organization" | undefined {
  if (s.recipient_mode !== "workspace" || !s.workspace_target?.kind) return undefined;
  if (s.workspace_target.kind === "personal_team") return "team";
  if (s.workspace_target.kind === "enterprise_workspace") return "organization";
  return undefined;
}

export function useShares(listQuery?: SharesListQuery | null): UseSharesResult {
  const { user } = useAuth();
  const [owned, setOwned] = useState<ShareListItem[]>([]);
  const [invited, setInvited] = useState<ShareListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchingRef = useRef(false);
  const hasLoadedOnceRef = useRef(false);

  const fetchShares = useCallback(async () => {
    if (!user) {
      setOwned([]);
      setInvited([]);
      hasLoadedOnceRef.current = false;
      setLoading(false);
      return;
    }

    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!hasLoadedOnceRef.current) setLoading(true);
    setError(null);
    const controller = new AbortController();
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams();
      if (listQuery) {
        params.set("context", listQuery.context);
        if (listQuery.workspace_kind) params.set("workspace_kind", listQuery.workspace_kind);
        if (listQuery.workspace_id) params.set("workspace_id", listQuery.workspace_id);
        if (listQuery.organization_id) params.set("organization_id", listQuery.organization_id);
      }
      const qs = params.toString();
      const res = await fetch(qs ? `/api/shares?${qs}` : "/api/shares", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to load shares");
      }
      const data = await res.json();
      const mapOwned = (s: {
        id: string;
        token: string;
        folder_name: string;
        share_label?: string;
        backing_item_name?: string;
        workspace_display_name?: string;
        item_type?: string;
        permission: string;
        share_url: string;
        invited_emails?: string[];
        recipient_mode?: string;
        workspace_target?: { kind: string; id: string };
        workspace_target_key?: string;
      }): ShareListItem => ({
        id: s.id,
        token: s.token,
        folder_name: s.folder_name,
        share_label: s.share_label,
        backing_item_name: s.backing_item_name,
        workspace_display_name: s.workspace_display_name,
        item_type: s.item_type === "file" ? "file" : "folder",
        permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
        share_url: s.share_url,
        sharedBy: "You",
        invited_emails: Array.isArray(s.invited_emails) ? s.invited_emails : [],
        recipient_mode: s.recipient_mode,
        workspace_target: s.workspace_target,
        workspace_target_key: s.workspace_target_key,
        share_destination: destinationFromShareRow(s),
        workspace_delivery_status: (s as { workspace_delivery_status?: string }).workspace_delivery_status,
      });
      const mapInvited = (s: {
        id: string;
        token: string;
        folder_name: string;
        share_label?: string;
        backing_item_name?: string;
        item_type?: string;
        permission: string;
        share_url: string;
        sharedBy?: string;
        owner_id?: string;
        sharedByEmail?: string;
        sharedByPhotoUrl?: string;
        recipient_mode?: string;
        workspace_target?: { kind: string; id: string };
        workspace_target_key?: string;
      }): ShareListItem => ({
        id: s.id,
        token: s.token,
        folder_name: s.folder_name,
        share_label: s.share_label,
        backing_item_name: s.backing_item_name,
        item_type: s.item_type === "file" ? "file" : "folder",
        permission: s.permission === "edit" ? ("edit" as const) : ("view" as const),
        share_url: s.share_url,
        sharedBy: s.sharedBy ?? "Someone",
        owner_id: s.owner_id,
        sharedByEmail: s.sharedByEmail,
        sharedByPhotoUrl: s.sharedByPhotoUrl,
        recipient_mode: s.recipient_mode,
        workspace_target: s.workspace_target,
        workspace_target_key: s.workspace_target_key,
        workspace_delivery_status: (s as { workspace_delivery_status?: string }).workspace_delivery_status,
      });
      setOwned((data.owned ?? []).map(mapOwned));
      setInvited((data.invited ?? []).map(mapInvited));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shares");
      setOwned([]);
      setInvited([]);
    } finally {
      fetchingRef.current = false;
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [user, listQuery]);

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
