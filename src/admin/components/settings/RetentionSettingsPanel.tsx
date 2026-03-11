"use client";

import { useState, useEffect } from "react";
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
  const [trashRetentionDays, setTrashRetentionDays] = useState(30);
  const [archiveAfterInactiveDays, setArchiveAfterInactiveDays] = useState<number | "">(365);
  const [permanentDeleteAfterDays, setPermanentDeleteAfterDays] = useState<number | "">("");

  useEffect(() => {
    if (settings) {
      setTrashRetentionDays(settings.trashRetentionDays);
      setArchiveAfterInactiveDays(settings.archiveAfterInactiveDays ?? "");
      setPermanentDeleteAfterDays(settings.permanentDeleteAfterDays ?? "");
    }
  }, [settings]);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.({
        trashRetentionDays,
        archiveAfterInactiveDays: archiveAfterInactiveDays === "" ? null : Number(archiveAfterInactiveDays),
        permanentDeleteAfterDays: permanentDeleteAfterDays === "" ? null : Number(permanentDeleteAfterDays),
      });
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
          <input
            type="number"
            min={1}
            max={365}
            value={trashRetentionDays}
            onChange={(e) => setTrashRetentionDays(Number(e.target.value) || 1)}
            className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Files in trash are recoverable for this many days before permanent deletion.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Archive after inactive (days)
          </label>
          <input
            type="number"
            min={1}
            placeholder="Disabled if empty"
            value={archiveAfterInactiveDays}
            onChange={(e) => setArchiveAfterInactiveDays(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Files not accessed in this many days move to archive. Leave empty to disable.
          </p>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Permanent delete after (days)
          </label>
          <input
            type="number"
            min={1}
            placeholder="Uses trash retention"
            value={permanentDeleteAfterDays}
            onChange={(e) => setPermanentDeleteAfterDays(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-32 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Trashed files permanently deleted after this many days. Leave empty to use trash retention period.
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
