"use client";

import { useState } from "react";
import type { AlertThresholdSettings } from "@/admin/types/adminSettings.types";

interface AlertThresholdSettingsPanelProps {
  settings: AlertThresholdSettings | null;
  onSave?: (s: AlertThresholdSettings) => void;
}

export default function AlertThresholdSettingsPanel({
  settings,
  onSave,
}: AlertThresholdSettingsPanelProps) {
  const [saving, setSaving] = useState(false);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.(settings);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Alert thresholds
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Configure when alerts are triggered. Exceeding these thresholds creates warning or critical alerts.
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Error rate warning (%)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Warning alert when API error rate exceeds{" "}
            <strong>{settings.errorRateWarningPercent}%</strong>.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Error rate critical (%)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Critical alert when error rate exceeds{" "}
            <strong>{settings.errorRateCriticalPercent}%</strong>.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Upload failure warning (count)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Warning when failed uploads in last hour exceed{" "}
            <strong>{settings.uploadFailureWarningCount}</strong>.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Queue backlog warning
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Warning when background job queue exceeds{" "}
            <strong>{settings.queueBacklogWarning}</strong> jobs.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-70 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}
