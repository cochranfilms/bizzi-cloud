"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchUploadAnalytics } from "@/admin/services/adminUploadsService";
import { useAuth } from "@/context/AuthContext";

export function useAdminUploads() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchUploadAnalytics>>["metrics"] | null>(null);
  const [volume, setVolume] = useState<Awaited<ReturnType<typeof fetchUploadAnalytics>>["volume"]>([]);
  const [failures, setFailures] = useState<Awaited<ReturnType<typeof fetchUploadAnalytics>>["failures"]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    if (!metrics) setLoading(true);
    setError(null);
    try {
      const data = await fetchUploadAnalytics(14, { getToken });
      setMetrics(data.metrics);
      setVolume(data.volume);
      setFailures(data.failures);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load upload data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { metrics, volume, failures, loading, error, refresh, refreshing };
}
