"use client";

import { useState, useRef, useEffect } from "react";
import {
  LayoutGrid,
  List,
  ImageIcon,
  RectangleHorizontal,
  Square,
  RectangleVertical,
  Info,
} from "lucide-react";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import type { ViewMode, CardSize, AspectRatio, ThumbnailScale } from "@/context/LayoutSettingsContext";

function SegmentedButton<T extends string>({
  options,
  value,
  onChange,
  renderOption,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  renderOption: (opt: T) => React.ReactNode;
}) {
  return (
    <div className="flex gap-0.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-600 dark:bg-neutral-800">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`flex flex-1 items-center justify-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
            value === opt
              ? "bg-white text-bizzi-blue shadow dark:bg-neutral-700 dark:text-bizzi-cyan"
              : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          }`}
        >
          {renderOption(opt)}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? "bg-bizzi-blue dark:bg-bizzi-cyan" : "bg-neutral-200 dark:bg-neutral-600"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${
          checked ? "translate-x-6" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

interface AppearanceSettingsMenuProps {
  /** When true, show layout view options (list/grid/thumbnail) */
  showViewMode?: boolean;
  className?: string;
}

export default function AppearanceSettingsMenu({
  showViewMode = true,
  className = "",
}: AppearanceSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const {
    viewMode,
    cardSize,
    aspectRatio,
    thumbnailScale,
    showCardInfo,
    setViewMode,
    setCardSize,
    setAspectRatio,
    setThumbnailScale,
    setShowCardInfo,
  } = useLayoutSettings();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
          open
            ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700 dark:text-bizzi-cyan"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        }`}
        aria-label="Layout settings"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <LayoutGrid className="h-5 w-5" />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-neutral-200 bg-white p-4 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          role="menu"
        >
          <p className="mb-4 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Info className="h-3.5 w-3.5" />
            Visible to only you.
          </p>

          <div className="space-y-4">
            {showViewMode && (
              <div>
                <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Layout view
                </label>
                <SegmentedButton
                  options={["list", "grid", "thumbnail"] as ViewMode[]}
                  value={viewMode}
                  onChange={setViewMode}
                  renderOption={(opt) => {
                    if (opt === "list") return <List className="h-4 w-4" />;
                    if (opt === "grid") return <LayoutGrid className="h-4 w-4" />;
                    return <ImageIcon className="h-4 w-4" />;
                  }}
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Card size
              </label>
              <SegmentedButton
                options={["small", "medium", "large"] as CardSize[]}
                value={cardSize}
                onChange={setCardSize}
                renderOption={(opt) => opt.charAt(0).toUpperCase()}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Aspect ratio
              </label>
              <SegmentedButton
                options={["landscape", "square", "portrait"] as AspectRatio[]}
                value={aspectRatio}
                onChange={setAspectRatio}
                renderOption={(opt) => {
                  if (opt === "landscape") return <RectangleHorizontal className="h-4 w-4" />;
                  if (opt === "square") return <Square className="h-4 w-4" />;
                  return <RectangleVertical className="h-4 w-4" />;
                }}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Thumbnail scale
              </label>
              <SegmentedButton
                options={["fit", "fill"] as ThumbnailScale[]}
                value={thumbnailScale}
                onChange={setThumbnailScale}
                renderOption={(opt) => opt.charAt(0).toUpperCase() + opt.slice(1)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label
                htmlFor="show-card-info"
                className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Show card info
              </label>
              <ToggleSwitch checked={showCardInfo} onChange={setShowCardInfo} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
