"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchRevenueSummary,
  fetchRevenueByPlan,
  fetchRevenueTrend,
} from "@/admin/services/adminRevenueService";
import { useAuth } from "@/context/AuthContext";

export function useAdminRevenue() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchRevenueSummary>> | null>(null);
  const [byPlan, setByPlan] = useState<Awaited<ReturnType<typeof fetchRevenueByPlan>>>([]);
  const [trend, setTrend] = useState<Awaited<ReturnType<typeof fetchRevenueTrend>>>([]);
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
      const [s, p, t] = await Promise.all([
        fetchRevenueSummary({ getToken }),
        fetchRevenueByPlan({ getToken }),
        fetchRevenueTrend(30, { getToken }),
      ]);
      setSummary(s);
      setByPlan(p);
      setTrend(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load revenue data");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, byPlan, trend, loading, error, refresh };
}
