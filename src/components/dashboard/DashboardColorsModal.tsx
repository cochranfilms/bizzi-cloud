"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, RotateCcw } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { getDashboardBackground } from "@/lib/dashboard-appearance-themes";
import { getThemeById } from "@/lib/enterprise-themes";

const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

interface DashboardColorsModalProps {
  open: boolean;
  onClose: () => void;
}

function ColorPickerRow({
  disabled,
  value,
  onHexCommit,
  onInputChange,
  placeholder,
}: {
  disabled: boolean;
  value: string;
  onHexCommit: (hex: string) => void;
  onInputChange: (raw: string) => void;
  placeholder: string;
}) {
  const safe = HEX_REGEX.test(value) ? value : undefined;
  return (
    <div className="flex gap-2">
      <input
        type="color"
        disabled={disabled}
        value={safe ?? "#000000"}
        onChange={(e) => {
          const v = e.target.value;
          onInputChange(v);
          onHexCommit(v);
        }}
        className="h-10 w-14 cursor-pointer rounded border border-neutral-200 disabled:opacity-50 dark:border-neutral-700"
      />
      <input
        type="text"
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          onInputChange(v);
          if (HEX_REGEX.test(v)) onHexCommit(v);
        }}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
      />
    </div>
  );
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
    buttonColor,
    setButtonColor,
    resetToDefault,
    workspaceKey,
  } = useDashboardAppearance();
  const { org } = useEnterprise();
  const teamWs = usePersonalTeamWorkspace();
  const [accentInput, setAccentInput] = useState(accentColor);
  const [buttonsInput, setButtonsInput] = useState("");
  const [backgroundInput, setBackgroundInput] = useState("");

  const inheritedUiTheme = teamWs?.teamThemeId ?? org?.theme ?? "bizzi";
  const presetButtonHex = getThemeById(inheritedUiTheme).primary;
  const resolvedButtonsHex = getThemeById(uiThemeOverride ?? inheritedUiTheme).primary;
  const isDark = theme === "dark";
  const fallbackPageBg = isDark ? "#0a0a0a" : "#f5f5f5";
  const resolvedBackgroundHex =
    getDashboardBackground(backgroundThemeId, isDark) ?? fallbackPageBg;

  useEffect(() => {
    if (open) {
      setAccentInput(accentColor);
      setButtonsInput(buttonColor ?? resolvedButtonsHex);
      setBackgroundInput(resolvedBackgroundHex);
    }
  }, [open, accentColor, buttonColor, resolvedBackgroundHex, resolvedButtonsHex]);

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
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Buttons
            </label>
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Outline and highlights for main navigation and Quick access in this workspace. Leave
              as your team or org preset until you pick a custom color—this device remembers per
              workspace.
            </p>
            <ColorPickerRow
              disabled={appearanceLocked}
              value={buttonsInput}
              onInputChange={setButtonsInput}
              onHexCommit={setButtonColor}
              placeholder={presetButtonHex}
            />
            {(buttonColor !== null || uiThemeOverride !== null) && (
              <button
                type="button"
                disabled={appearanceLocked}
                className="mt-2 text-xs font-medium text-neutral-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-neutral-400"
                onClick={() => {
                  setButtonColor(null);
                  setUiThemeId(null);
                  setButtonsInput(presetButtonHex);
                }}
              >
                Use team / org preset color
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Background
            </label>
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Workspace page background for the current light or dark mode.
            </p>
            <ColorPickerRow
              disabled={appearanceLocked}
              value={backgroundInput}
              onInputChange={setBackgroundInput}
              onHexCommit={(v) => setBackgroundThemeId(v)}
              placeholder={fallbackPageBg}
            />
            {backgroundThemeId !== null && (
              <button
                type="button"
                disabled={appearanceLocked}
                className="mt-2 text-xs font-medium text-neutral-600 underline-offset-2 hover:underline disabled:opacity-50 dark:text-neutral-400"
                onClick={() => {
                  setBackgroundThemeId(null);
                  setBackgroundInput(fallbackPageBg);
                }}
              >
                Clear workspace background
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Theme
            </label>
            <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
              Accent tint for sections, highlights, and UI details (separate from button chrome).
            </p>
            <ColorPickerRow
              disabled={appearanceLocked}
              value={accentInput}
              onInputChange={setAccentInput}
              onHexCommit={setAccentColor}
              placeholder="#00BFFF"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={appearanceLocked}
              onClick={() => {
                resetToDefault();
                setAccentInput("#00BFFF");
                setButtonsInput(presetButtonHex);
                setBackgroundInput(fallbackPageBg);
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
