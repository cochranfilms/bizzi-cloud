"use client";

import type { LucideIcon } from "lucide-react";

export type SettingsNavItem = { id: string; label: string; icon: LucideIcon };

const quickAccessIdle =
  "border-neutral-200 text-neutral-800 hover:border-[var(--enterprise-primary)] hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:border-[var(--enterprise-primary)] dark:hover:bg-neutral-800/80";

export default function SettingsSidebarNav({
  activeId,
  onSelect,
  items,
  heading = "Settings",
  className = "",
  /**
   * `quickAccess` — same border, primary, and hover treatment as the right-panel Quick access items.
   * `enterprise` — team/enterprise settings (theme primary for active text).
   * `personal` — legacy Bizzi blue active state (avoid for dashboard; prefer `quickAccess`).
   */
  variant = "enterprise",
}: {
  activeId: string;
  onSelect: (id: string) => void;
  items: SettingsNavItem[];
  heading?: string;
  className?: string;
  variant?: "personal" | "enterprise" | "quickAccess";
}) {
  const activeCls =
    variant === "personal"
      ? "border border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-cyan dark:bg-bizzi-cyan/15 dark:text-bizzi-cyan"
      : variant === "quickAccess"
        ? "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 text-neutral-900 dark:text-white"
        : "bg-[var(--enterprise-primary)]/15 text-[var(--enterprise-primary)]";
  const idleCls =
    variant === "quickAccess"
      ? `border border-transparent bg-white dark:bg-neutral-900 ${quickAccessIdle}`
      : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

  const iconCls =
    variant === "quickAccess"
      ? "h-5 w-5 shrink-0 text-[var(--enterprise-primary)] [&_svg]:stroke-[1.75]"
      : variant === "personal"
        ? "h-4 w-4 shrink-0 opacity-80"
        : "h-4 w-4 shrink-0 opacity-80";

  const padCls = variant === "quickAccess" ? "gap-3 px-3 py-2.5" : "gap-2 px-3 py-2";

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
            className={`flex w-full items-center rounded-lg text-left text-sm font-medium transition-colors ${padCls} ${
              activeId === id ? activeCls : idleCls
            }`}
          >
            <Icon className={iconCls} strokeWidth={variant === "quickAccess" ? 1.75 : 2} />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}
