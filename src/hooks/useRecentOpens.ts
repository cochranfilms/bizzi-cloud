"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getAuthToken } from "@/lib/auth-token";

export interface RecentOpenItem {
  type: "file" | "folder";
  id: string;
  name: string;
  driveId?: string;
  driveName?: string;
  path?: string;
  objectKey?: string;
  size?: number;
  modifiedAt?: string | null;
  contentType?: string | null;
  galleryId?: string | null;
  openedAt: string;
}

function buildRecentOpensScope(pathname: string | null, organizationId: string | null | undefined) {
  if (typeof pathname === "string" && pathname.startsWith("/enterprise")) {
    if (!organizationId) return null;
    return {
      context: "enterprise" as const,
      organizationId,
    };
  }
  if (typeof pathname === "string") {
    const teamMatch = /^\/team\/([^/]+)/.exec(pathname);
    if (teamMatch) {
      return { context: "team" as const, teamOwnerId: teamMatch[1] };
    }
  }
  return { context: "personal" as const };
}

export function useRecentOpens() {
  const { user } = useAuth();
  const pathname = usePathname();
  const { org } = useEnterprise();
  const [items, setItems] = useState<RecentOpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);

  const scope = useMemo(
    () => buildRecentOpensScope(pathname, org?.id),
    [pathname, org?.id]
  );

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      hasLoadedOnceRef.current = false;
      setLoading(false);
      return;
    }
    if (pathname?.startsWith("/enterprise") && scope === null) {
      setItems([]);
      setLoading(true);
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (scope) {
        params.set("context", scope.context);
        if (scope.context === "enterprise") params.set("organization_id", scope.organizationId);
        if (scope.context === "team") params.set("team_owner_id", scope.teamOwnerId);
      }
      const res = await fetch(`/api/recent-opens?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items ?? []);
      }
    } catch {
      setItems([]);
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [user, pathname, scope]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return { items, loading, refresh: fetchItems };
}

export async function recordRecentOpen(
  itemType: "file" | "folder",
  itemId: string,
  getToken: () => Promise<string | null>
): Promise<void> {
  const token = await getToken();
  if (!token) return;
  try {
    await fetch("/api/recent-opens", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ itemType, itemId }),
    });
  } catch {
    // Best-effort, ignore
  }
}
