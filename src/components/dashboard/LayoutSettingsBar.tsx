"use client";

import { useState } from "react";
import {
  LayoutGrid,
  List,
  ImageIcon,
  RectangleHorizontal,
  Square,
  RectangleVertical,
  Eye,
  EyeOff,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import type { ViewMode, CardSize, AspectRatio, ThumbnailScale } from "@/context/LayoutSettingsContext";

interface LayoutSettingsBarProps {
  showViewMode?: boolean;
  className?: string;
}

/** Horizontal layout settings bar - use below tab buttons for a distinct, non-Frame.io style */
function OptionGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  renderOption,
}: {
  label: string;
  value: T;
  options: T[];
  onChange: (v: T) => void;
  renderOption: (opt: T) => React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
        {label}
      </span>
      <div className="flex rounded-md bg-neutral-100 dark:bg-neutral-800/80 ring-1 ring-neutral-200/60 dark:ring-neutral-700/60 overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`flex items-center justify-center px-2.5 py-1.5 text-xs font-medium transition-colors ${
              value === opt
                ? "bg-bizzi-blue text-white dark:bg-bizzi-cyan dark:text-neutral-950"
                : "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-700/60"
            }`}
          >
            {renderOption(opt)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LayoutSettingsBar({
  showViewMode = true,
  className = "",
}: LayoutSettingsBarProps) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Toolbar first so expansion grows left; Layout stays next to New */}
      {expanded && (
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2"
          role="toolbar"
          aria-label="Layout settings"
        >
          {showViewMode && (
            <OptionGroup
              label="View"
              value={viewMode}
              options={["list", "grid", "thumbnail"] as ViewMode[]}
              onChange={setViewMode}
              renderOption={(opt) => {
                if (opt === "list") return <List className="h-3.5 w-3.5" />;
                if (opt === "grid") return <LayoutGrid className="h-3.5 w-3.5" />;
                return <ImageIcon className="h-3.5 w-3.5" />;
              }}
            />
          )}
          {viewMode !== "thumbnail" && (
            <OptionGroup
              label="Size"
              value={cardSize}
              options={["small", "medium", "large"] as CardSize[]}
              onChange={setCardSize}
              renderOption={(opt) => opt.charAt(0).toUpperCase()}
            />
          )}
          <OptionGroup
            label="Ratio"
            value={aspectRatio}
            options={["landscape", "square", "portrait"] as AspectRatio[]}
            onChange={setAspectRatio}
            renderOption={(opt) => {
              if (opt === "landscape") return <RectangleHorizontal className="h-3.5 w-3.5" />;
              if (opt === "square") return <Square className="h-3.5 w-3.5" />;
              return <RectangleVertical className="h-3.5 w-3.5" />;
            }}
          />
          <OptionGroup
            label="Scale"
            value={thumbnailScale}
            options={["fit", "fill"] as ThumbnailScale[]}
            onChange={setThumbnailScale}
            renderOption={(opt) => opt.charAt(0).toUpperCase() + opt.slice(1)}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
              Info
            </span>
            <button
              type="button"
              onClick={() => setShowCardInfo(!showCardInfo)}
              className={`flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                showCardInfo
                  ? "bg-bizzi-blue text-white dark:bg-bizzi-cyan dark:text-neutral-950"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/60 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-700/60 ring-1 ring-neutral-200/60 dark:ring-neutral-700/60"
              }`}
              aria-pressed={showCardInfo}
            >
              {showCardInfo ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={`shrink-0 flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
          expanded
            ? "bg-bizzi-blue text-white dark:bg-bizzi-cyan dark:text-neutral-950"
            : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200/60 dark:bg-neutral-800/80 dark:text-neutral-400 dark:hover:bg-neutral-700/60 ring-1 ring-neutral-200/60 dark:ring-neutral-700/60"
        }`}
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse layout settings" : "Show layout settings"}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span>Layout</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}
