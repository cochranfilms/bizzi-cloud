"use client";

import { Loader2 } from "lucide-react";
import { LOADING } from "@/lib/loading-copy";

interface LoadingSpinnerProps {
  /** Optional label; use LOADING.* for consistency */
  label?: string;
  /** Size: sm (default), md, lg */
  size?: "sm" | "md" | "lg";
  /** Center in parent with py-12 */
  centered?: boolean;
  /** Additional className for wrapper */
  className?: string;
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-8 w-8",
  lg: "h-10 w-10",
};

export function LoadingSpinner({
  label = LOADING.default,
  size = "sm",
  centered = false,
  className = "",
}: LoadingSpinnerProps) {
  const wrapperClass = centered
    ? `flex flex-col items-center justify-center gap-3 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400 ${className}`
    : `flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 ${className}`;

  return (
    <div className={wrapperClass} aria-busy="true" role="status" aria-label={label}>
      <Loader2
        className={`animate-spin text-bizzi-blue dark:text-bizzi-cyan ${sizeClasses[size]}`}
        aria-hidden
      />
      {label && <span>{label}</span>}
    </div>
  );
}
