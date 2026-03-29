"use client";

import type { LucideIcon } from "lucide-react";

export type SettingsNavItem = { id: string; label: string; icon: LucideIcon };

export default function SettingsSidebarNav({
  activeId,
  onSelect,
  items,
  heading = "Settings",
  className = "",
  /** Personal dashboard uses Bizzi blue; team / enterprise chrome uses CSS theme primary. */
  variant = "enterprise",
}: {
  activeId: string;
  onSelect: (id: string) => void;
  items: SettingsNavItem[];
  heading?: string;
  className?: string;
  variant?: "personal" | "enterprise";
}) {
  const activeCls =
    variant === "personal"
      ? "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
      : "bg-[var(--enterprise-primary)]/15 text-[var(--enterprise-primary)]";
  const idleCls =
    "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

  return (
    <nav
      aria-label="Settings sections"
      className={`shrink-0 rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-700 dark:bg-neutral-900 lg:w-56 ${className}`}
    >
      <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {heading}
      </p>
      <div className="flex flex-col gap-0.5">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeId === id ? activeCls : idleCls
            }`}
          >
            <Icon className="h-4 w-4 shrink-0 opacity-80" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
