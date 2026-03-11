"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchSupportTickets,
  fetchSupportIssueBreakdown,
} from "@/admin/services/adminSupportService";
import { useAuth } from "@/context/AuthContext";

export function useAdminSupport() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Awaited<ReturnType<typeof fetchSupportTickets>>["tickets"]>([]);
  const [total, setTotal] = useState(0);
  const [breakdown, setBreakdown] = useState<Awaited<ReturnType<typeof fetchSupportIssueBreakdown>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async (filters?: { status?: string; priority?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, b] = await Promise.all([
        fetchSupportTickets(filters, 1, 25, { getToken }),
        fetchSupportIssueBreakdown({ getToken }),
      ]);
      setTickets(tRes.tickets);
      setTotal(tRes.total);
      setBreakdown(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load support data");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tickets, total, breakdown, loading, error, refresh };
}
