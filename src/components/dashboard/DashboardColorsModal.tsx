"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import { DASHBOARD_BACKGROUND_THEMES } from "@/lib/dashboard-appearance-themes";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

interface DashboardColorsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function DashboardColorsModal({ open, onClose }: DashboardColorsModalProps) {
  const { theme } = useTheme();
  const {
    accentColor,
    setAccentColor,
    backgroundThemeId,
    setBackgroundThemeId,
    resetToDefault,
  } = useDashboardAppearance();
  const [accentInput, setAccentInput] = useState(accentColor);

  useEffect(() => {
    if (open) {
      setAccentInput(accentColor);
    }
  }, [open, accentColor]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const isDark = theme === "dark";

  const content = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dashboard-colors-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3
            id="dashboard-colors-modal-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            Dashboard colors
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 p-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Background
            </label>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Choose a background color for your dashboard. Options adapt to light or dark theme.
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {DASHBOARD_BACKGROUND_THEMES.map((t) => {
                const bg = isDark ? t.darkBackground : t.lightBackground;
                const selected = backgroundThemeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBackgroundThemeId(selected ? null : t.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors ${
                      selected
                        ? "border-bizzi-blue ring-2 ring-bizzi-blue/20"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                    }`}
                    title={t.name}
                  >
                    <div
                      className="h-8 w-8 rounded-full border border-neutral-200 dark:border-neutral-600"
                      style={{ backgroundColor: bg }}
                    />
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Accent color
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={HEX_REGEX.test(accentInput) ? accentInput : accentColor}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccentInput(v);
                  setAccentColor(v);
                }}
                className="h-10 w-14 cursor-pointer rounded border border-neutral-200 dark:border-neutral-700"
              />
              <input
                type="text"
                value={accentInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccentInput(v);
                  if (HEX_REGEX.test(v)) setAccentColor(v);
                }}
                placeholder="#00BFFF"
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                resetToDefault();
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(content, document.body)
    : null;
}
