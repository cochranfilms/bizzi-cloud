"use client";

import { useState, useEffect } from "react";
import { Megaphone } from "lucide-react";
import type { BannerSettings } from "@/admin/types/adminSettings.types";

interface BannerSettingsPanelProps {
  settings: BannerSettings | null;
  onSave?: (s: BannerSettings) => void;
}

export default function BannerSettingsPanel({
  settings,
  onSave,
}: BannerSettingsPanelProps) {
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<BannerSettings["severity"]>("info");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setMessage(settings.message);
      setSeverity(settings.severity);
    }
  }, [settings]);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.({ enabled, message, severity });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Announcement banner
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Show an internal announcement banner to all users. Use for important updates, planned outages, or new features.
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
                ? "bg-bizzi-blue dark:bg-bizzi-cyan"
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
            {enabled ? "Banner visible" : "Banner hidden"}
          </span>
        </div>

        {enabled && (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Severity
              </label>
              <select
                value={severity}
                onChange={(e) =>
                  setSeverity(e.target.value as BannerSettings["severity"])
                }
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="New feature: Bulk download is now available..."
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            <div
              className={`rounded-lg border p-3 ${
                severity === "info"
                  ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20"
                  : severity === "warning"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                    : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
              }`}
            >
              <p className="flex items-center gap-2 text-sm">
                <Megaphone className="h-4 w-4" />
                Preview: {message || "Your announcement message"}
              </p>
            </div>
          </>
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
