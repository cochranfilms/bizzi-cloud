"use client";

import { useState, useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import type { MaintenanceSettings } from "@/admin/types/adminSettings.types";

interface MaintenanceModePanelProps {
  settings: MaintenanceSettings | null;
  onSave?: (s: MaintenanceSettings) => void;
}

export default function MaintenanceModePanel({
  settings,
  onSave,
}: MaintenanceModePanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setMessage(settings.message);
    }
  }, [settings]);
  const [saving, setSaving] = useState(false);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.({ enabled, message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Maintenance mode
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        When enabled, the platform shows a maintenance message and blocks non-admin access. Use for deployments or migrations.
      </p>

      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled
                ? "bg-amber-500"
                : "bg-neutral-200 dark:bg-neutral-700"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
          <span className="font-medium">
            {enabled ? "Maintenance mode ON" : "Maintenance mode OFF"}
          </span>
        </div>

        {enabled && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Message shown to users
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={"We're performing scheduled maintenance..."}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>
        )}

        {enabled && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Enabling maintenance mode will block all user access except for admins.
            </p>
          </div>
        )}

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
