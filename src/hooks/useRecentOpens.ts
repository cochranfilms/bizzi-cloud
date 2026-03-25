"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
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

export function useRecentOpens() {
  const { user } = useAuth();
  const [items, setItems] = useState<RecentOpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);

  const fetchItems = useCallback(async () => {
    if (!user) {
      setItems([]);
      hasLoadedOnceRef.current = false;
      setLoading(false);
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    if (!hasLoadedOnceRef.current) setLoading(true);
    try {
      const res = await fetch("/api/recent-opens?limit=50", {
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
  }, [user]);

  useEffect(() => {
    fetchItems();
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
