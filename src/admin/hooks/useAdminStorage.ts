"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchStorageSummary,
  fetchLargestAccounts,
} from "@/admin/services/adminStorageService";
import { useAuth } from "@/context/AuthContext";

export function useAdminStorage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchStorageSummary>> | null>(null);
  const [largestAccounts, setLargestAccounts] = useState<Awaited<ReturnType<typeof fetchLargestAccounts>>>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, largestAccounts, loading, error, refresh };
}
