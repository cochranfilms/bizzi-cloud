"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import type { RecentFile } from "@/hooks/useCloudFiles";
import {
  filtersFromSearchParams,
  searchParamsFromFilters,
  hasActiveFilters,
  getActiveFilters,
  removeFilter,
  type FilterState,
  type ActiveFilter,
} from "@/lib/filters/apply-filters";

const FILTER_DEBOUNCE_MS = 300;

export interface UseFilteredFilesOptions {
  /** Scope to a specific drive when viewing inside a drive */
  driveId?: string | null;
  /** Use standard useCloudFiles when no filters (default true) */
  fallbackToCloudFiles?: boolean;
}

export interface UseFilteredFilesResult {
  files: RecentFile[];
  loading: boolean;
  totalCount: number;
  /** Set or update a filter */
  setFilter: (id: string, value: string | string[] | boolean | undefined) => void;
  /** Remove a single filter */
  removeFilterById: (id: string, value?: string) => void;
  /** Clear all filters */
  clearFilters: () => void;
  /** Current filter state */
  filterState: FilterState;
  /** Active filters for chip display */
  activeFilters: ActiveFilter[];
  /** Whether any filters are active */
  hasFilters: boolean;
}

/** Map API response file to RecentFile */
function toRecentFile(raw: Record<string, unknown>): RecentFile {
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    path: String(raw.path ?? ""),
    objectKey: String(raw.objectKey ?? ""),
    size: Number(raw.size ?? 0),
    modifiedAt: (raw.modifiedAt as string) ?? null,
    driveId: String(raw.driveId ?? ""),
    driveName: String(raw.driveName ?? "Unknown"),
    contentType: (raw.contentType as string) ?? null,
    galleryId: (raw.galleryId as string) ?? null,
  };
}

export function useFilteredFiles(
  options?: UseFilteredFilesOptions
): UseFilteredFilesResult {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { driveId, fallbackToCloudFiles = true } = options ?? {};

  const [filterState, setFilterState] = useState<FilterState>(() =>
    filtersFromSearchParams(searchParams)
  );
  const [files, setFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const hasFilters = hasActiveFilters(filterState);

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
        let next = removeFilter(prev, id, value);
        if (id === "date") {
          next = { ...next };
          delete next.date_from;
          delete next.date_to;
        }
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
      setTotalCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken(true);
      const params = searchParamsFromFilters(filterState);
      if (driveId) params.set("drive_id", driveId);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/files/filter?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setFiles([]);
        setTotalCount(0);
        return;
      }
      const data = (await res.json()) as {
        files?: Record<string, unknown>[];
        totalCount?: number;
      };
      const list = (data.files ?? []).map(toRecentFile);
      setFiles(list);
      setTotalCount(data.totalCount ?? list.length);
    } catch {
      setFiles([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [user, filterState, driveId]);

  useEffect(() => {
    setFilterState(filtersFromSearchParams(searchParams));
  }, [searchParams]);

  useEffect(() => {
    if (hasFilters) {
      const t = setTimeout(fetchFiltered, FILTER_DEBOUNCE_MS);
      return () => clearTimeout(t);
    }
  }, [hasFilters, fetchFiltered]);

  const activeFilters = getActiveFilters(filterState);

  return {
    files: hasFilters ? files : [],
    loading: hasFilters ? loading : false,
    totalCount: hasFilters ? totalCount : 0,
    setFilter,
    removeFilterById,
    clearFilters,
    filterState,
    activeFilters,
    hasFilters,
  };
}
