"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAlerts } from "@/admin/services/adminAlertsService";
import { useAuth } from "@/context/AuthContext";
import type { AdminAlert } from "@/admin/types/adminAlerts.types";

export function useAdminAlerts() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
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
      const data = await fetchAlerts(undefined, { getToken });
      setAlerts(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { alerts, loading, error, refresh };
}
