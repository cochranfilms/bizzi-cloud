"use client";

import { Heart } from "lucide-react";

interface HeartButtonProps {
  count: number;
  hasHearted: boolean;
  loading?: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  showCount?: boolean;
}

/** Reusable heart/like button with optimistic UI. */
export default function HeartButton({
  count,
  hasHearted,
  loading = false,
  onToggle,
  size = "md",
  showCount = true,
}: HeartButtonProps) {
  const iconSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={loading}
      className={`flex items-center gap-1.5 rounded-lg p-1.5 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-neutral-800 ${
        hasHearted
          ? "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
          : "text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
      }`}
      aria-label={hasHearted ? "Unheart" : "Heart"}
    >
      <Heart
        className={`${iconSize} ${hasHearted ? "fill-current" : ""}`}
        strokeWidth={2}
      />
      {showCount && (
        <span className="text-sm font-medium tabular-nums text-neutral-600 dark:text-neutral-400">
          {count}
        </span>
      )}
    </button>
  );
}
