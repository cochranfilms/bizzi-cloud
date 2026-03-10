"use client";

import { useState } from "react";
import { formatBytes } from "@/admin/utils/formatBytes";
import type { QuotaSettings } from "@/admin/types/adminSettings.types";

interface QuotaSettingsPanelProps {
  settings: QuotaSettings | null;
  onSave?: (s: QuotaSettings) => void;
}

export default function QuotaSettingsPanel({
  settings,
  onSave,
}: QuotaSettingsPanelProps) {
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
        Quotas & limits
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Storage limits per plan and global upload limits. Changes apply to new signups.
      </p>

      <div className="space-y-6">
        <div>
          <h4 className="mb-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Plan storage limits
          </h4>
          <dl className="divide-y divide-neutral-200 dark:divide-neutral-700">
            <div className="flex justify-between py-3">
              <dt className="text-sm text-neutral-600 dark:text-neutral-400">Free</dt>
              <dd>{formatBytes(settings.freeStorageBytes)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-neutral-600 dark:text-neutral-400">Starter</dt>
              <dd>{formatBytes(settings.starterStorageBytes)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-neutral-600 dark:text-neutral-400">Pro</dt>
              <dd>{formatBytes(settings.proStorageBytes)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-neutral-600 dark:text-neutral-400">Business</dt>
              <dd>{formatBytes(settings.businessStorageBytes)}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm text-neutral-600 dark:text-neutral-400">Enterprise</dt>
              <dd>{settings.enterpriseStorageBytes == null ? "Unlimited" : formatBytes(settings.enterpriseStorageBytes)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Max single upload size
          </h4>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {formatBytes(settings.maxUploadBytes)}
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
