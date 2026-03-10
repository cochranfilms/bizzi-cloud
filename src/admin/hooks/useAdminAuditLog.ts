"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAuditLog } from "@/admin/services/adminAuditService";

export function useAdminAuditLog() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof fetchAuditLog>>["entries"]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const refresh = useCallback(async (filters?: { action?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAuditLog(filters, page, 50);
      setEntries(res.entries);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { entries, total, loading, error, page, setPage, refresh };
}
