"use client";

import { useState } from "react";
import PageHeader from "../components/shared/PageHeader";
import SettingsNavigation from "../components/settings/SettingsNavigation";
import QuotaSettingsPanel from "../components/settings/QuotaSettingsPanel";
import RetentionSettingsPanel from "../components/settings/RetentionSettingsPanel";
import AlertThresholdSettingsPanel from "../components/settings/AlertThresholdSettingsPanel";
import FeatureFlagsPanel from "../components/settings/FeatureFlagsPanel";
import MaintenanceModePanel from "../components/settings/MaintenanceModePanel";
import BannerSettingsPanel from "../components/settings/BannerSettingsPanel";
import { useAdminSettings, type SettingsSection } from "../hooks/useAdminSettings";
import LoadingSkeleton from "../components/shared/LoadingSkeleton";

export default function SettingsPage() {
  const {
    quotas,
    retention,
    alerts,
    features,
    maintenance,
    banner,
    loading,
    error,
    refresh,
  } = useAdminSettings();

  const [activeSection, setActiveSection] = useState<SettingsSection>("quotas");

  const handleSave = () => {
    void refresh();
  };

  if (loading && !quotas) {
    return (
      <div className="space-y-6">
        <PageHeader title="Settings" subtitle="Platform configuration" />
        <LoadingSkeleton lines={8} className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Plan limits, retention, alerts, feature flags, and system controls"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
          >
            Refresh
          </button>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
          <SettingsNavigation
            active={activeSection}
            onSelect={setActiveSection}
          />
        </div>

        <div>
          {activeSection === "quotas" && (
            <QuotaSettingsPanel settings={quotas} onSave={handleSave} />
          )}
          {activeSection === "retention" && (
            <RetentionSettingsPanel settings={retention} onSave={handleSave} />
          )}
          {activeSection === "alerts" && (
            <AlertThresholdSettingsPanel settings={alerts} onSave={handleSave} />
          )}
          {activeSection === "features" && (
            <FeatureFlagsPanel flags={features} onSave={handleSave} />
          )}
          {activeSection === "maintenance" && (
            <MaintenanceModePanel settings={maintenance} onSave={handleSave} />
          )}
          {activeSection === "banner" && (
            <BannerSettingsPanel settings={banner} onSave={handleSave} />
          )}
        </div>
      </div>
    </div>
  );
}
