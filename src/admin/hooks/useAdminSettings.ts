"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchAllSettings } from "@/admin/services/adminSettingsService";
import { useAuth } from "@/context/AuthContext";
import type {
  QuotaSettings,
  RetentionSettings,
  AlertThresholdSettings,
  FeatureFlags,
  MaintenanceSettings,
  BannerSettings,
  DisplaySettings,
} from "@/admin/types/adminSettings.types";

export type SettingsSection =
  | "quotas"
  | "retention"
  | "alerts"
  | "features"
  | "maintenance"
  | "banner"
  | "display";

export function useAdminSettings() {
  const { user } = useAuth();
  const [quotas, setQuotas] = useState<QuotaSettings | null>(null);
  const [retention, setRetention] = useState<RetentionSettings | null>(null);
  const [alerts, setAlerts] = useState<AlertThresholdSettings | null>(null);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceSettings | null>(null);
  const [banner, setBanner] = useState<BannerSettings | null>(null);
  const [display, setDisplay] = useState<DisplaySettings | null>(null);
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
      const data = await fetchAllSettings({ getToken });
      setQuotas(data.quotas);
      setRetention(data.retention);
      setAlerts(data.alerts);
      setFeatures(data.features);
      setMaintenance(data.maintenance);
      setBanner(data.banner);
      setDisplay(data.display ?? { locale: "en-US", currency: "USD" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    quotas,
    retention,
    alerts,
    features,
    maintenance,
    banner,
    display,
    loading,
    error,
    refresh,
  };
}
