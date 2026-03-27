"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { apiFileToRecentFile, type RecentFile } from "@/hooks/useCloudFiles";
import {
  FILTER_FILES_MAX_CUMULATIVE_PAGES,
  FILTER_FILES_PAGE_SIZE,
} from "@/lib/filters/filter-fetch-config";
import {
  filtersFromSearchParams,
  searchParamsFromFilters,
  filterStateToSearchParams,
  hasActiveFilters,
  getActiveFilters,
  removeFilter,
  type FilterState,
  type ActiveFilter,
} from "@/lib/filters/apply-filters";

/** Debounce before hitting /api/files/filter after filter key changes (pairs with search UI debounce). */
const FILTER_DEBOUNCE_MS = 400;

/** Stable serialization of filter state for effect deps - avoids refetch loops */
function filterStateKey(state: FilterState): string {
  const keys = Object.keys(state).sort();
  return keys.map((k) => `${k}=${JSON.stringify(state[k])}`).join("|");
}

/** Shared query shape for page 1 and "Load more" (cursor appended per request). */
function buildFilterApiSearchParams(args: {
  filterState: FilterState;
  driveIdForApi: string | null | undefined;
  teamOwnerFromPath: string | null;
  isEnterprise: boolean;
  orgId: string | undefined;
  selectedWorkspaceId: string | null;
}): URLSearchParams {
  const {
    filterState,
    driveIdForApi,
    teamOwnerFromPath,
    isEnterprise,
    orgId,
    selectedWorkspaceId,
  } = args;
  const creativeProjectsActive = filterState.creative_projects === true;
  const params = filterStateToSearchParams(filterState);
  if (driveIdForApi) params.set("drive_id", driveIdForApi);
  if (teamOwnerFromPath) params.set("team_owner_id", teamOwnerFromPath);
  if (isEnterprise && orgId) {
    params.set("context", "enterprise");
    params.set("organization_id", orgId);
    /**
     * Enterprise scope for Project Files (`creative_projects` / All files chip):
     * We intentionally **omit** `workspace_id` so the result set matches the **Projects**
     * sidebar tab (org-wide creative assets the member can access).
     *
     * All **other** enterprise filter combinations still pass `workspace_id` when the user
     * has a workspace selected, so Videos/Photos/search/advanced filters stay aligned with
     * the rest of the enterprise browser (workspace-scoped).
     */
    if (
      !creativeProjectsActive &&
      selectedWorkspaceId != null &&
      selectedWorkspaceId !== ""
    ) {
      params.set("workspace_id", selectedWorkspaceId);
    }
  }
  params.set("page_size", String(FILTER_FILES_PAGE_SIZE));
  return params;
}

export interface UseFilteredFilesOptions {
  driveId?: string | null;
  effectiveDriveId?: string | null;
  driveIdAsNavigation?: string | null;
  fallbackToCloudFiles?: boolean;
}

export interface UseFilteredFilesResult {
  files: RecentFile[];
  loading: boolean;
  /** True while appending the next cursor page. */
  loadMoreLoading: boolean;
  /** Raw rows returned so far for the active filter (before any UI merge e.g. macOS packages). */
  loadedCount: number;
  /** Server indicates another page exists for this filter. */
  hasMore: boolean;
  /** Append next page (same filter + cursor). Respects {@link FILTER_FILES_MAX_CUMULATIVE_PAGES}. */
  loadMore: () => Promise<void>;
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  removeFilterById: (id: string, value?: string) => void;
  clearFilters: () => void;
  clearFiltersAndKeepDrive: (driveId: string) => void;
  filterState: FilterState;
  activeFilters: ActiveFilter[];
  hasFilters: boolean;
  useFilteredScoped: boolean;
}

export function useFilteredFiles(
  options?: UseFilteredFilesOptions
): UseFilteredFilesResult {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const { selectedWorkspaceId } = useCurrentFolder();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { driveId, effectiveDriveId, driveIdAsNavigation } = options ?? {};
  const isEnterprise = typeof pathname === "string" && pathname.startsWith("/enterprise");
  const teamOwnerFromPath =
    typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null : null;
  const driveIdForApi = effectiveDriveId ?? driveId;

  const [filterState, setFilterState] = useState<FilterState>(() =>
    filtersFromSearchParams(searchParams)
  );
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadMoreLoading, setLoadMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const filterEpochRef = useRef(0);
  const listAbortRef = useRef<AbortController | null>(null);
  const pagesFetchedRef = useRef(0);

  const effectiveFilterState =
    driveIdAsNavigation && filterState.drive === driveIdAsNavigation
      ? (() => {
          const { drive: _d, ...rest } = filterState;
          return rest;
        })()
      : filterState;
  const effectiveFilterStateRef = useRef(effectiveFilterState);
  effectiveFilterStateRef.current = effectiveFilterState;
  const hasFilters = hasActiveFilters(effectiveFilterState);
  const useFilteredScoped = hasFilters || !!effectiveDriveId;
  const filterKey = useMemo(
    () => `${filterStateKey(effectiveFilterState)}|effective=${effectiveDriveId ?? ""}`,
    [effectiveFilterState, effectiveDriveId]
  );

  const updateUrl = useCallback(
    (state: FilterState) => {
      const params = searchParamsFromFilters(state);
      const query = params.toString();
      const next = query ? `${pathname ?? ""}?${query}` : pathname ?? "";
      router.replace(next, { scroll: false });
    },
    [pathname, router]
  );

  const setFilter = useCallback(
    (id: string, value: string | string[] | boolean | undefined) => {
      setFilterState((prev) => {
        const next = { ...prev };
        if (value === undefined || value === "" || value === false) {
          delete next[id];
        } else {
          next[id] = value;
        }
        updateUrl(next);
        return next;
      });
    },
    [updateUrl]
  );

  const removeFilterById = useCallback(
    (id: string, value?: string) => {
      setFilterState((prev) => {
        const next = removeFilter(prev, id, value);
        updateUrl(next);
        return next;
      });
    },
    [updateUrl]
  );

  const clearFilters = useCallback(() => {
    setFilterState({});
    updateUrl({});
  }, [updateUrl]);

  const fetchFiltered = useCallback(async () => {
    if (!user) {
      setFiles([]);
      setHasMore(false);
      setNextCursor(null);
      pagesFetchedRef.current = 0;
      setLoading(false);
      return;
    }

    filterEpochRef.current += 1;
    const epoch = filterEpochRef.current;
    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;
    const { signal } = ac;

    const state = effectiveFilterStateRef.current;
    setLoading(true);
    setLoadMoreLoading(false);
    pagesFetchedRef.current = 0;
    setNextCursor(null);
    setHasMore(false);

    try {
      const token = await user.getIdToken(true);
      if (epoch !== filterEpochRef.current) return;

      const base = typeof window !== "undefined" ? window.location.origin : "";
      const driveNameFallback = new Map<string, string>();
      const mapRows = (rows: Record<string, unknown>[]) =>
        rows.map((raw) => apiFileToRecentFile(raw, driveNameFallback));

      const params = buildFilterApiSearchParams({
        filterState: state,
        driveIdForApi,
        teamOwnerFromPath,
        isEnterprise,
        orgId: org?.id,
        selectedWorkspaceId: selectedWorkspaceId ?? null,
      });
      params.delete("cursor");

      const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (epoch !== filterEpochRef.current) return;

      if (!res.ok) {
        setFiles([]);
        setHasMore(false);
        setNextCursor(null);
        return;
      }

      const data = (await res.json()) as {
        files?: Record<string, unknown>[];
        cursor?: string | null;
        hasMore?: boolean;
      };
      const pageRows = mapRows(data.files ?? []);
      pagesFetchedRef.current = 1;
      let stillHasMore = data.hasMore === true && !!data.cursor;
      if (pagesFetchedRef.current >= FILTER_FILES_MAX_CUMULATIVE_PAGES) stillHasMore = false;

      setFiles(pageRows);
      setNextCursor(stillHasMore && data.cursor ? String(data.cursor) : null);
      setHasMore(stillHasMore);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (epoch !== filterEpochRef.current) return;
      setFiles([]);
      setHasMore(false);
      setNextCursor(null);
    } finally {
      if (epoch === filterEpochRef.current) setLoading(false);
    }
  }, [user, driveIdForApi, isEnterprise, org?.id, teamOwnerFromPath, selectedWorkspaceId]);

  const loadMore = useCallback(async () => {
    if (!user || !useFilteredScoped) return;
    if (!hasMore || !nextCursor || loading || loadMoreLoading) return;
    if (pagesFetchedRef.current >= FILTER_FILES_MAX_CUMULATIVE_PAGES) return;

    const epoch = filterEpochRef.current;
    const ac = new AbortController();
    listAbortRef.current?.abort();
    listAbortRef.current = ac;
    const { signal } = ac;

    setLoadMoreLoading(true);
    try {
      const token = await user.getIdToken(true);
      if (epoch !== filterEpochRef.current) return;

      const state = effectiveFilterStateRef.current;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const driveNameFallback = new Map<string, string>();

      const params = buildFilterApiSearchParams({
        filterState: state,
        driveIdForApi,
        teamOwnerFromPath,
        isEnterprise,
        orgId: org?.id,
        selectedWorkspaceId: selectedWorkspaceId ?? null,
      });
      params.set("cursor", nextCursor);

      const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (epoch !== filterEpochRef.current) return;

      if (!res.ok) return;

      const data = (await res.json()) as {
        files?: Record<string, unknown>[];
        cursor?: string | null;
        hasMore?: boolean;
      };
      const mapRows = (rows: Record<string, unknown>[]) =>
        rows.map((raw) => apiFileToRecentFile(raw, driveNameFallback));
      const pageRows = mapRows(data.files ?? []);

      setFiles((prev) => [...prev, ...pageRows]);
      pagesFetchedRef.current += 1;
      let stillHasMore = data.hasMore === true && !!data.cursor;
      if (pagesFetchedRef.current >= FILTER_FILES_MAX_CUMULATIVE_PAGES) stillHasMore = false;
      setNextCursor(stillHasMore && data.cursor ? String(data.cursor) : null);
      setHasMore(stillHasMore);
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    } finally {
      setLoadMoreLoading(false);
    }
  }, [
    user,
    useFilteredScoped,
    hasMore,
    nextCursor,
    loading,
    loadMoreLoading,
    driveIdForApi,
    isEnterprise,
    org?.id,
    teamOwnerFromPath,
    selectedWorkspaceId,
  ]);

  const searchQueryString = typeof searchParams?.toString === "function" ? searchParams.toString() : "";

  useEffect(() => {
    const next = filtersFromSearchParams(searchParams);
    setFilterState((prev) => {
      if (filterStateKey(prev) === filterStateKey(next)) return prev;
      return next;
    });
  }, [searchQueryString]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!useFilteredScoped) {
      listAbortRef.current?.abort();
      setFiles([]);
      setHasMore(false);
      setNextCursor(null);
      pagesFetchedRef.current = 0;
      return;
    }
    const t = window.setTimeout(() => {
      void fetchFiltered();
    }, FILTER_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      listAbortRef.current?.abort();
    };
  }, [useFilteredScoped, filterKey, fetchFiltered]);

  const clearFiltersAndKeepDrive = useCallback(
    (driveIdToKeep: string) => {
      const next = `${pathname ?? ""}?drive=${driveIdToKeep}`;
      router.replace(next, { scroll: false });
      setFilterState({ drive: driveIdToKeep });
    },
    [pathname, router]
  );

  const activeFilters = getActiveFilters(effectiveFilterState);

  return {
    files: useFilteredScoped ? files : [],
    loading: useFilteredScoped ? loading : false,
    loadMoreLoading: useFilteredScoped ? loadMoreLoading : false,
    loadedCount: useFilteredScoped ? files.length : 0,
    hasMore: useFilteredScoped ? hasMore : false,
    loadMore,
    setFilter,
    removeFilterById,
    clearFilters,
    clearFiltersAndKeepDrive,
    filterState,
    activeFilters,
    hasFilters,
    useFilteredScoped,
  };
}
