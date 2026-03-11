"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAuditLog } from "@/admin/services/adminAuditService";
import { useAuth } from "@/context/AuthContext";

export function useAdminAuditLog() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof fetchAuditLog>>["entries"]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async (filters?: { action?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLog(filters, page, 50, { getToken });
      setEntries(res.entries);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, total, loading, error, page, setPage, refresh };
}
