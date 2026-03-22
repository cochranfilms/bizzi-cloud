"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getAuthToken } from "@/lib/auth-token";

export interface ActivityLogItem {
  id: string;
  event_type: string;
  actor_user_id: string;
  scope_type: string;
  organization_id?: string | null;
  workspace_id?: string | null;
  target_type?: string | null;
  target_name?: string | null;
  file_path?: string | null;
  old_path?: string | null;
  new_path?: string | null;
  created_at: string | null;
  metadata?: Record<string, unknown> | null;
}

export function useActivityLogs(scope: "personal" | "organization" = "personal") {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const [items, setItems] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      setLoading(false);
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        scope,
        limit: "50",
      });
      if (scope === "organization" && org?.id) {
        params.set("organization_id", org.id);
      }
      const res = await fetch(`/api/activity-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user, scope, org?.id]);

  useEffect(() => {
    if (scope === "organization" && !org?.id) {
      setItems([]);
      setLoading(false);
      return;
    }
    fetchItems();
  }, [fetchItems, scope, org?.id]);

  return { items, loading, refresh: fetchItems };
}
