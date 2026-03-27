"use client";

import { Heart } from "lucide-react";

interface HeartButtonProps {
  count: number;
  hasHearted: boolean;
  loading?: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  showCount?: boolean;
  /** Immersive preview header: light icon/count on dark glass */
  immersiveDark?: boolean;
  /** Immersive preview with light header bar: dark icon/count for contrast */
  immersiveLightChrome?: boolean;
}

/** Reusable heart/like button with optimistic UI. */
export default function HeartButton({
  count,
  hasHearted,
  loading = false,
  onToggle,
  size = "md",
  showCount = true,
  immersiveDark = false,
  immersiveLightChrome = false,
}: HeartButtonProps) {
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const baseBtn = immersiveLightChrome
    ? "rounded-none p-1.5 hover:bg-neutral-900/10"
    : immersiveDark
      ? "rounded-none p-1.5 hover:bg-white/10"
      : "rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800";
  const heartColors = immersiveLightChrome
    ? hasHearted
      ? "text-red-600 hover:text-red-700"
      : "text-neutral-600 hover:text-neutral-900"
    : immersiveDark
      ? hasHearted
        ? "text-red-400 hover:text-red-300"
        : "text-white/75 hover:text-white"
      : hasHearted
        ? "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
        : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300";
  const countCls = immersiveLightChrome
    ? "text-sm font-medium tabular-nums text-neutral-800"
    : immersiveDark
      ? "text-sm font-medium tabular-nums text-white/85"
      : "text-sm font-medium tabular-nums text-neutral-600 dark:text-neutral-400";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={`flex items-center gap-1.5 p-1.5 transition-colors disabled:opacity-50 ${baseBtn} ${heartColors}`}
      aria-label={hasHearted ? "Unheart" : "Heart"}
    >
      <Heart
        className={`${iconSize} ${hasHearted ? "fill-current" : ""}`}
        strokeWidth={2}
      />
      {showCount && <span className={countCls}>{count}</span>}
    </button>
  );
}
