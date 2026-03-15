"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/auth-token";
import type { Notification } from "@/types/collaboration";

const POLL_INTERVAL_MS = 30_000;

export function useUnreadCount() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchCount = useCallback(async () => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }
    const token = await getAuthToken();
    if (!token) {
      setCount(0);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/notifications/count", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setCount(data.count ?? 0);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return { count, loading, refresh: fetchCount };
}

export function useNotifications(options?: {
  limit?: number;
  unreadOnly?: boolean;
  pollInterval?: number;
}) {
  const { user } = useAuth();
  const limit = options?.limit ?? 20;
  const unreadOnly = options?.unreadOnly ?? false;
  const pollInterval = options?.pollInterval ?? POLL_INTERVAL_MS;

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      if (!user) {
        setNotifications([]);
        setLoading(false);
        return;
      }
      const token = await getAuthToken();
      if (!token) return;
      const params = new URLSearchParams({
        limit: String(limit),
        unreadOnly: String(unreadOnly),
      });
      if (cursor) params.set("cursor", cursor);
      try {
        const res = await fetch(
          `/api/notifications?${params.toString()}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          const list = data.notifications ?? [];
          if (!cursor) setNotifications(list);
          else setNotifications((prev) => [...prev, ...list]);
          setNextCursor(data.nextCursor ?? null);
          setHasMore(data.hasMore ?? false);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [user, limit, unreadOnly]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(null);
    const interval = setInterval(() => fetchPage(null), pollInterval);
    return () => clearInterval(interval);
  }, [fetchPage, pollInterval]);

  const loadMore = useCallback(() => {
    if (nextCursor && hasMore) fetchPage(nextCursor);
  }, [nextCursor, hasMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(null), [fetchPage]);

  return {
    notifications,
    loading,
    hasMore,
    loadMore,
    refresh,
  };
}

export async function markNotificationRead(
  id: string,
  token: string
): Promise<boolean> {
  const res = await fetch(`/api/notifications/${id}/read`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}

export async function markAllNotificationsRead(
  token: string
): Promise<{ updated: number }> {
  const res = await fetch("/api/notifications/mark-all-read", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { updated: 0 };
  const data = await res.json();
  return { updated: data.updated ?? 0 };
}
