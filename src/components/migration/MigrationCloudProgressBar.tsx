"use client";

import { Cloud } from "lucide-react";

type MigrationCloudProgressBarProps = {
  /** Screen-reader + visible label */
  label: string;
  subtitle?: string | null;
  /** 0–100 when known; null = indeterminate (scan still running) */
  percent: number | null;
};

/** Progress row with Bizzi cloud motif; matches platform accent colors. */
export default function MigrationCloudProgressBar({
  label,
  subtitle,
  percent,
}: MigrationCloudProgressBarProps) {
  const showPct = percent != null && Number.isFinite(percent);

  return (
    <div className="space-y-2.5 rounded-xl border border-bizzi-blue/20 bg-white/70 px-4 py-3 dark:border-bizzi-blue/30 dark:bg-neutral-900/60">
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-bizzi-sky to-white shadow-inner shadow-bizzi-blue/10 dark:from-bizzi-navy/50 dark:to-neutral-900"
          aria-hidden
        >
          <Cloud className="h-5 w-5 text-bizzi-blue animate-clouds-drift-slow" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-bizzi-navy dark:text-white">{label}</p>
            {showPct ? (
              <span className="text-xs font-bold tabular-nums text-bizzi-blue dark:text-bizzi-cyan">
                {Math.round(Math.min(100, Math.max(0, percent!)))}%
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full border border-bizzi-blue/15 bg-bizzi-sky/50 dark:border-neutral-600 dark:bg-neutral-800"
        role="progressbar"
        aria-valuenow={showPct ? Math.round(percent!) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        {showPct ? (
          <div
            className="h-full rounded-full bg-gradient-to-r from-bizzi-blue via-sky-400 to-bizzi-cyan shadow-sm transition-[width] duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, percent!))}%` }}
          />
        ) : (
          <div className="relative h-full w-full overflow-hidden rounded-full bg-neutral-200/50 dark:bg-neutral-700/50">
            <div className="absolute inset-y-0 w-2/5 rounded-full bg-gradient-to-r from-bizzi-blue/30 via-bizzi-cyan to-bizzi-blue/30 animate-migration-bar-sweep" />
          </div>
        )}
      </div>
    </div>
  );
}
