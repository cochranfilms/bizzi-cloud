"use client";

import { useState } from "react";
import type { RetentionSettings } from "@/admin/types/adminSettings.types";

interface RetentionSettingsPanelProps {
  settings: RetentionSettings | null;
  onSave?: (s: RetentionSettings) => void;
}

export default function RetentionSettingsPanel({
  settings,
  onSave,
}: RetentionSettingsPanelProps) {
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
        Retention rules
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Configure how long files stay in trash, when they&apos;re archived, and when permanently deleted.
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Trash retention (days)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Files in trash are recoverable for{" "}
            <strong>{settings.trashRetentionDays} days</strong> before permanent
            deletion.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Archive after inactive (days)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {settings.archiveAfterInactiveDays != null
              ? `Files not accessed in ${settings.archiveAfterInactiveDays} days move to archive.`
              : "Archiving by inactivity is disabled."}
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Permanent delete after (days)
          </label>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {settings.permanentDeleteAfterDays != null
              ? `Trashed files are permanently deleted after ${settings.permanentDeleteAfterDays} days.`
              : "Uses trash retention period."}
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
