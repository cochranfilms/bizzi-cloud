"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { DASHBOARD_BACKGROUND_THEMES } from "@/lib/dashboard-appearance-themes";
import { ENTERPRISE_THEMES } from "@/lib/enterprise-themes";

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
    uiThemeOverride,
    setUiThemeId,
    resetToDefault,
    workspaceKey,
  } = useDashboardAppearance();
  const { org } = useEnterprise();
  const teamWs = usePersonalTeamWorkspace();
  const [accentInput, setAccentInput] = useState(accentColor);

  const inheritedUiTheme =
    teamWs?.teamThemeId ?? org?.theme ?? "bizzi";
  const selectedThemeId = uiThemeOverride ?? inheritedUiTheme;

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
  const appearanceLocked = workspaceKey === "enterprise:pending";

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
        className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
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
          {appearanceLocked && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Loading workspace… save is momentarily unavailable.
            </p>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Theme
            </label>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Navigation and highlight colors for this workspace only. This device remembers your
              choice per workspace.
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {ENTERPRISE_THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  disabled={appearanceLocked}
                  onClick={() => setUiThemeId(t.id)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-2 transition-colors disabled:opacity-50 ${
                    selectedThemeId === t.id
                      ? "border-bizzi-blue bg-bizzi-blue/10 ring-2 ring-bizzi-blue/20 dark:border-bizzi-cyan dark:bg-bizzi-cyan/10 dark:ring-bizzi-cyan/25"
                      : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                  }`}
                  title={t.name}
                >
                  <div
                    className="h-7 w-7 rounded-full"
                    style={{ backgroundColor: t.primary }}
                  />
                  <span className="text-center text-[10px] font-medium leading-tight text-neutral-700 dark:text-neutral-300 sm:text-xs">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Background
            </label>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              Background for this workspace. Options adapt to light or dark theme.
            </p>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
              {DASHBOARD_BACKGROUND_THEMES.map((t) => {
                const bg = isDark ? t.darkBackground : t.lightBackground;
                const selected = backgroundThemeId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    disabled={appearanceLocked}
                    onClick={() => setBackgroundThemeId(selected ? null : t.id)}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 p-2 transition-colors disabled:opacity-50 ${
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
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Buttons and accents for this workspace (separate from theme highlights).
            </p>
            <div className="flex gap-2">
              <input
                type="color"
                disabled={appearanceLocked}
                value={HEX_REGEX.test(accentInput) ? accentInput : accentColor}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccentInput(v);
                  setAccentColor(v);
                }}
                className="h-10 w-14 cursor-pointer rounded border border-neutral-200 disabled:opacity-50 dark:border-neutral-700"
              />
              <input
                type="text"
                disabled={appearanceLocked}
                value={accentInput}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccentInput(v);
                  if (HEX_REGEX.test(v)) setAccentColor(v);
                }}
                placeholder="#00BFFF"
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={appearanceLocked}
              onClick={() => {
                resetToDefault();
                setAccentInput("#00BFFF");
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-800 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <RotateCcw className="h-4 w-4" />
              Reset to default
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
