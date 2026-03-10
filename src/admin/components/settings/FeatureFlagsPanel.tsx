"use client";

import { useState, useEffect } from "react";
import type { FeatureFlags } from "@/admin/types/adminSettings.types";

interface FeatureFlagsPanelProps {
  flags: FeatureFlags | null;
  onSave?: (f: FeatureFlags) => void;
}

export default function FeatureFlagsPanel({ flags, onSave }: FeatureFlagsPanelProps) {
  const [localFlags, setLocalFlags] = useState<FeatureFlags>({});
  useEffect(() => {
    if (flags) setLocalFlags(flags);
  }, [flags]);
  const [saving, setSaving] = useState(false);

  if (!flags) return null;

  const keys = Object.keys(flags);
  if (keys.length === 0) return null;

  const handleToggle = (key: string, value: boolean) => {
    setLocalFlags((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.(localFlags);
    } finally {
      setSaving(false);
    }
  };

  const formatLabel = (key: string) =>
    key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Feature flags
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Enable or disable features across the platform. Changes take effect immediately.
      </p>

      <div className="space-y-4">
        {keys.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-700"
          >
            <div>
              <p className="font-medium">{formatLabel(key)}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {key}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localFlags[key] ?? flags[key]}
              onClick={() => handleToggle(key, !(localFlags[key] ?? flags[key]))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                localFlags[key] ?? flags[key]
                  ? "bg-bizzi-blue dark:bg-bizzi-cyan"
                  : "bg-neutral-200 dark:bg-neutral-700"
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                  localFlags[key] ?? flags[key] ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-6 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-70 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
