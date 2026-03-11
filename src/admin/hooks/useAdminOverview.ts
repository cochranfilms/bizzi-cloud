"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchOverviewMetrics,
  fetchPlatformHealth,
  fetchCriticalAlerts,
  fetchTopAccounts,
} from "@/admin/services/adminOverviewService";
import { fetchRevenueTrend } from "@/admin/services/adminRevenueService";
import { useAuth } from "@/context/AuthContext";
import type {
  OverviewMetrics,
  PlatformHealthCheck,
  CriticalAlert,
  TopAccount,
} from "@/admin/types/adminOverview.types";
import type { RevenueDataPoint } from "@/admin/types/adminRevenue.types";

export function useAdminOverview() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [health, setHealth] = useState<PlatformHealthCheck[]>([]);
  const [alerts, setAlerts] = useState<CriticalAlert[]>([]);
  const [topAccounts, setTopAccounts] = useState<TopAccount[]>([]);
  const [revenueTrend, setRevenueTrend] = useState<RevenueDataPoint[]>([]);
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
      const [m, h, a, t, r] = await Promise.all([
        fetchOverviewMetrics({ getToken }),
        fetchPlatformHealth({ getToken }),
        fetchCriticalAlerts({ getToken }),
        fetchTopAccounts({ getToken }),
        fetchRevenueTrend(30, { getToken }),
      ]);
      setMetrics(m);
      setHealth(h);
      setAlerts(a);
      setTopAccounts(t);
      setRevenueTrend(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const systemStatus: "healthy" | "warning" | "critical" =
    health.some((c) => c.status === "critical")
      ? "critical"
      : health.some((c) => c.status === "warning")
        ? "warning"
        : "healthy";

  return {
    metrics,
    health,
    alerts,
    topAccounts,
    revenueTrend,
    loading,
    error,
    refresh,
    systemStatus,
  };
}
