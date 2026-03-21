"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAlerts } from "@/admin/services/adminAlertsService";
import { useAuth } from "@/context/AuthContext";
import { usePageVisibility } from "@/hooks/usePageVisibility";

const POLL_INTERVAL_MS = 30_000;

export function useAdminAlertCount() {
  const { user } = useAuth();
  const isVisible = usePageVisibility();
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const getToken = useCallback(
    () => (user ? user.getIdToken() : Promise.resolve(null)),
    [user]
  );

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const alerts = await fetchAlerts(undefined, { getToken });
      setCount(Array.isArray(alerts) ? alerts.length : 0);
    } catch {
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, [getToken, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!user || !isVisible) return;
    const interval = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh, user, isVisible]);

  return { count, loading, refresh };
}
