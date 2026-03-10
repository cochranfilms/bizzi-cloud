"use client";

import type { ReactNode } from "react";
import { type LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { mapSeverityToBadge, type Severity } from "@/admin/utils/mapSeverityToBadge";

interface SummaryCardProps {
  label: string;
  value: string | number;
  delta?: { value: number; label: string; isPositive?: boolean; isNegative?: boolean };
  trend?: "up" | "down" | "neutral";
  icon?: LucideIcon;
  status?: Severity;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

export default function SummaryCard({
  label,
  value,
  delta,
  trend,
  icon: Icon,
  status,
  subtitle,
  onClick,
  className = "",
}: SummaryCardProps) {
  const badge = status ? mapSeverityToBadge(status) : null;
  const isClickable = Boolean(onClick);

  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm transition-shadow dark:border-neutral-700 dark:bg-neutral-900 dark:shadow-neutral-900/50 ${
        isClickable ? "cursor-pointer hover:shadow-md" : ""
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-white">
            {value}
          </p>
          {(delta || subtitle) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {delta && (
                <span
                  className={`flex items-center gap-0.5 text-sm ${
                    delta.isPositive
                      ? "text-emerald-600 dark:text-emerald-400"
                      : delta.isNegative
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-neutral-500 dark:text-neutral-400"
                  }`}
                >
                  {trend === "up" && <TrendingUp className="h-3.5 w-3.5" />}
                  {trend === "down" && <TrendingDown className="h-3.5 w-3.5" />}
                  {delta.label}
                </span>
              )}
              {subtitle && (
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {subtitle}
                </span>
              )}
            </div>
          )}
        </div>
        {Icon && (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan">
            <Icon className="h-5 w-5" />
          </div>
        )}
        {badge && (
          <span className={badge.className}>
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}
            />
            {status}
          </span>
        )}
      </div>
    </div>
  );
}
