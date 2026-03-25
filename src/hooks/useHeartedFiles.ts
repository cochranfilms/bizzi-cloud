"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAuthToken } from "@/lib/auth-token";
import type { RecentFile } from "@/hooks/useCloudFiles";

export function useHeartedFiles(options?: { limit?: number }) {
  const { user } = useAuth();
  const limit = options?.limit ?? 50;
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const hasLoadedFirstPageRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor?: string | null) => {
      if (!user) {
        setFiles([]);
        hasLoadedFirstPageRef.current = false;
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      const token = await getAuthToken();
      if (!token) {
        setLoading(false);
        setLoadingMore(false);
        return;
      }
      if (!cursor) {
        if (!hasLoadedFirstPageRef.current) setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/files/hearted?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const list = (data.files ?? []).map((f: Record<string, unknown>) => ({
            id: f.id as string,
            name: f.name as string,
            path: f.path as string,
            objectKey: f.objectKey as string,
            size: (f.size as number) ?? 0,
            modifiedAt: f.modifiedAt as string | null,
            driveId: f.driveId as string,
            driveName: f.driveName as string,
            contentType: f.contentType as string | null,
            galleryId: f.galleryId as string | null,
          }));
          if (!cursor) {
            setFiles(list);
            hasLoadedFirstPageRef.current = true;
          } else setFiles((prev) => [...prev, ...list]);
          setNextCursor(data.nextCursor ?? null);
          setHasMore(data.hasMore ?? false);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [user, limit]
  );

  useEffect(() => {
    fetchPage(null);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading && !loadingMore) fetchPage(nextCursor);
  }, [nextCursor, loading, loadingMore, fetchPage]);

  const refresh = useCallback(() => fetchPage(null), [fetchPage]);

  return {
    files,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh,
  };
}
