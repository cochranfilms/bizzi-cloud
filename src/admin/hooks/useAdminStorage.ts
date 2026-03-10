"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchStorageSummary,
  fetchLargestAccounts,
} from "@/admin/services/adminStorageService";

export function useAdminStorage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchStorageSummary>> | null>(null);
  const [largestAccounts, setLargestAccounts] = useState<Awaited<ReturnType<typeof fetchLargestAccounts>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, a] = await Promise.all([fetchStorageSummary(), fetchLargestAccounts()]);
      setSummary(s);
      setLargestAccounts(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load storage data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, largestAccounts, loading, error, refresh };
}
