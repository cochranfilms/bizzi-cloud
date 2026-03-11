"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchAdminFiles,
  fetchLargeFiles,
  type FilesFilters,
} from "@/admin/services/adminFilesService";
import { useAuth } from "@/context/AuthContext";

export function useAdminFiles() {
  const { user } = useAuth();
  const [files, setFiles] = useState<Awaited<ReturnType<typeof fetchAdminFiles>>["files"]>([]);
  const [total, setTotal] = useState(0);
  const [largeFiles, setLargeFiles] = useState<Awaited<ReturnType<typeof fetchLargeFiles>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async (filters: FilesFilters = {}) => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, lf] = await Promise.all([
        fetchAdminFiles(filters, page, 25, { getToken }),
        fetchLargeFiles(10, { getToken }),
      ]);
      setFiles(fRes.files);
      setTotal(fRes.total);
      setLargeFiles(lf);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [page, getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { files, total, largeFiles, loading, error, page, setPage, refresh };
}
