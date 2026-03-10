"use client";

import { useState, useEffect, useCallback } from "react";
import {
  fetchQuotaSettings,
  fetchRetentionSettings,
  fetchAlertThresholdSettings,
  fetchFeatureFlags,
  fetchMaintenanceSettings,
  fetchBannerSettings,
} from "@/admin/services/adminSettingsService";
import type {
  QuotaSettings,
  RetentionSettings,
  AlertThresholdSettings,
  FeatureFlags,
  MaintenanceSettings,
  BannerSettings,
} from "@/admin/types/adminSettings.types";

export type SettingsSection =
  | "quotas"
  | "retention"
  | "alerts"
  | "features"
  | "maintenance"
  | "banner";

export function useAdminSettings() {
  const [quotas, setQuotas] = useState<QuotaSettings | null>(null);
  const [retention, setRetention] = useState<RetentionSettings | null>(null);
  const [alerts, setAlerts] = useState<AlertThresholdSettings | null>(null);
  const [features, setFeatures] = useState<FeatureFlags | null>(null);
  const [maintenance, setMaintenance] = useState<MaintenanceSettings | null>(null);
  const [banner, setBanner] = useState<BannerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, r, a, f, m, b] = await Promise.all([
        fetchQuotaSettings(),
        fetchRetentionSettings(),
        fetchAlertThresholdSettings(),
        fetchFeatureFlags(),
        fetchMaintenanceSettings(),
        fetchBannerSettings(),
      ]);
      setQuotas(q);
      setRetention(r);
      setAlerts(a);
      setFeatures(f);
      setMaintenance(m);
      setBanner(b);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

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
    loading,
    error,
    refresh,
  };
}
