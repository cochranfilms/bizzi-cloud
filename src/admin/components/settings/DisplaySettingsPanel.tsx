"use client";

import { useState, useEffect } from "react";
import type { DisplaySettings } from "@/admin/types/adminSettings.types";
import { useAdminDisplay } from "@/context/AdminDisplayContext";

interface DisplaySettingsPanelProps {
  settings: DisplaySettings | null;
  onSave?: (s: Partial<DisplaySettings>) => void;
}

const COMMON_LOCALES = ["en-US", "en-GB", "de-DE", "fr-FR", "es-ES", "ja-JP"];
const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD"];

export default function DisplaySettingsPanel({
  settings,
  onSave,
}: DisplaySettingsPanelProps) {
  const { refresh } = useAdminDisplay();
  const [saving, setSaving] = useState(false);
  const [locale, setLocale] = useState("en-US");
  const [currency, setCurrency] = useState("USD");

  useEffect(() => {
    if (settings) {
      setLocale(settings.locale);
      setCurrency(settings.currency);
    }
  }, [settings]);

  if (!settings) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave?.({ locale, currency });
      await refresh();
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = locale !== settings.locale || currency !== settings.currency;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h3 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Display preferences
      </h3>
      <p className="mb-6 text-sm text-neutral-500 dark:text-neutral-400">
        Locale and currency for admin dashboard formatting (numbers, dates, revenue).
      </p>

      <div className="space-y-6">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Locale
          </label>
          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {COMMON_LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
            <option value="other">Other (edit in Firestore)</option>
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Currency
          </label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
          >
            {COMMON_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="other">Other (edit in Firestore)</option>
          </select>
        </div>

        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>
    </div>
  );
}
