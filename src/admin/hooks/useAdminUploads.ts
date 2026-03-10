"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchUploadMetrics,
  fetchUploadVolume,
  fetchUploadFailures,
} from "@/admin/services/adminUploadsService";

export function useAdminUploads() {
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof fetchUploadMetrics>> | null>(null);
  const [volume, setVolume] = useState<Awaited<ReturnType<typeof fetchUploadVolume>>>([]);
  const [failures, setFailures] = useState<Awaited<ReturnType<typeof fetchUploadFailures>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, v, f] = await Promise.all([
        fetchUploadMetrics(),
        fetchUploadVolume(14),
        fetchUploadFailures(),
      ]);
      setMetrics(m);
      setVolume(v);
      setFailures(f);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load upload data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { metrics, volume, failures, loading, error, refresh };
}
