"use client";

import { useState, useEffect } from "react";
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
  const [errorRateWarningPercent, setErrorRateWarningPercent] = useState(5);
  const [errorRateCriticalPercent, setErrorRateCriticalPercent] = useState(10);
  const [uploadFailureWarningCount, setUploadFailureWarningCount] = useState(100);
  const [queueBacklogWarning, setQueueBacklogWarning] = useState(500);

  useEffect(() => {
    if (settings) {
      setErrorRateWarningPercent(settings.errorRateWarningPercent);
      setErrorRateCriticalPercent(settings.errorRateCriticalPercent);
      setUploadFailureWarningCount(settings.uploadFailureWarningCount);
      setQueueBacklogWarning(settings.queueBacklogWarning);
    }
  }, [settings]);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.({
        errorRateWarningPercent,
        errorRateCriticalPercent,
        uploadFailureWarningCount,
        queueBacklogWarning,
      });
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
          <input
            type="number"
            min={0}
            max={100}
            value={errorRateWarningPercent}
            onChange={(e) => setErrorRateWarningPercent(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Warning alert when API error rate exceeds this percentage.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Error rate critical (%)
          </label>
          <input
            type="number"
            min={0}
            max={100}
            value={errorRateCriticalPercent}
            onChange={(e) => setErrorRateCriticalPercent(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Critical alert when error rate exceeds this percentage.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Upload failure warning (count)
          </label>
          <input
            type="number"
            min={0}
            value={uploadFailureWarningCount}
            onChange={(e) => setUploadFailureWarningCount(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Warning when failed uploads in last hour exceed this count.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Queue backlog warning
          </label>
          <input
            type="number"
            min={0}
            value={queueBacklogWarning}
            onChange={(e) => setQueueBacklogWarning(Number(e.target.value) || 0)}
            className="w-24 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Warning when background job queue exceeds this many jobs.
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
