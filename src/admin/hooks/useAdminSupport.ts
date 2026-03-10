"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchSupportTickets,
  fetchSupportIssueBreakdown,
} from "@/admin/services/adminSupportService";

export function useAdminSupport() {
  const [tickets, setTickets] = useState<Awaited<ReturnType<typeof fetchSupportTickets>>["tickets"]>([]);
  const [total, setTotal] = useState(0);
  const [breakdown, setBreakdown] = useState<Awaited<ReturnType<typeof fetchSupportIssueBreakdown>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters?: { status?: string; priority?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, b] = await Promise.all([
        fetchSupportTickets(filters),
        fetchSupportIssueBreakdown(),
      ]);
      setTickets(tRes.tickets);
      setTotal(tRes.total);
      setBreakdown(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load support data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tickets, total, breakdown, loading, error, refresh };
}
