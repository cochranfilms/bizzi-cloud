"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchStorageSummary,
  fetchLargestAccounts,
  fetchBucketStats,
  runOrphanCleanup,
  type BucketStats,
  type OrphanCleanupResult,
} from "@/admin/services/adminStorageService";
import { useAuth } from "@/context/AuthContext";

export function useAdminStorage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchStorageSummary>> | null>(null);
  const [largestAccounts, setLargestAccounts] = useState<Awaited<ReturnType<typeof fetchLargestAccounts>>>([]);
  const [bucketStats, setBucketStats] = useState<BucketStats | null>(null);
  const [orphanResult, setOrphanResult] = useState<OrphanCleanupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBucket, setLoadingBucket] = useState(false);
  const [loadingOrphan, setLoadingOrphan] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([
        fetchStorageSummary({ getToken }),
        fetchLargestAccounts(10, { getToken }),
      ]);
      setSummary(s);
      setLargestAccounts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load storage data");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const loadBucketStats = useCallback(async () => {
    setLoadingBucket(true);
    try {
      const b = await fetchBucketStats({ getToken });
      setBucketStats(b ?? null);
    } finally {
      setLoadingBucket(false);
    }
  }, [getToken]);

  const runOrphanCheck = useCallback(
    async (dryRun: boolean) => {
      setLoadingOrphan(true);
      setOrphanResult(null);
      try {
        const r = await runOrphanCleanup(dryRun, { getToken });
        setOrphanResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Orphan cleanup failed");
      } finally {
        setLoadingOrphan(false);
      }
    },
    [getToken]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (user) void loadBucketStats();
  }, [user, loadBucketStats]);

  return {
    summary,
    largestAccounts,
    bucketStats,
    orphanResult,
    loading,
    loadingBucket,
    loadingOrphan,
    error,
    refresh,
    loadBucketStats,
    runOrphanCheck,
  };
}
