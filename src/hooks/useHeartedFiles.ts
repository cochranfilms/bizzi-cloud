"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getAuthToken } from "@/lib/auth-token";
import type { RecentFile } from "@/hooks/useCloudFiles";

export function useHeartedFiles(options?: {
  limit?: number;
  /** Extra query for /api/files/hearted (e.g. workspace_scope=team&team_owner_id=…) */
  workspaceHeartsQuery?: string | null;
  /**
   * When true, expand heart list to any seat member on team/org routes under …/files.
   * Personal `/dashboard/files` stays user-only (null inference).
   */
  inferWorkspaceHeartsFromRoute?: boolean;
}) {
  const pathname = usePathname();
  const { org } = useEnterprise();
  const { user } = useAuth();
  const limit = options?.limit ?? 50;
  const inferredWorkspaceQuery = useMemo(() => {
    if (!options?.inferWorkspaceHeartsFromRoute) return null;
    if (typeof pathname !== "string") return null;
    const isFilesLanding =
      /^\/(dashboard|enterprise)\/files$/.test(pathname) ||
      /^\/team\/[^/]+\/files$/.test(pathname) ||
      /^\/desktop\/app\/files$/.test(pathname);
    if (!isFilesLanding) return null;
    if (pathname.startsWith("/enterprise") && org?.id) {
      return `workspace_scope=enterprise&organization_id=${encodeURIComponent(org.id)}`;
    }
    const m = /^\/team\/([^/]+)/.exec(pathname);
    if (m?.[1]) {
      return `workspace_scope=team&team_owner_id=${encodeURIComponent(m[1])}`;
    }
    return null;
  }, [options?.inferWorkspaceHeartsFromRoute, pathname, org?.id]);

  const workspaceHeartsQuery = options?.workspaceHeartsQuery ?? inferredWorkspaceQuery;
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const hasLoadedFirstPageRef = useRef(false);

  useEffect(() => {
    hasLoadedFirstPageRef.current = false;
  }, [workspaceHeartsQuery]);

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
        if (workspaceHeartsQuery) {
          const extra = new URLSearchParams(workspaceHeartsQuery);
          extra.forEach((v, k) => params.set(k, v));
        }
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
    [user, limit, workspaceHeartsQuery]
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
    /** True when hearts are merged across team/org seats (excludes personal-only). */
    workspaceHeartsActive: workspaceHeartsQuery != null && workspaceHeartsQuery.length > 0,
  };
}
