"use client";

import { useState } from "react";
import { Search, Bell, RefreshCw, ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { formatRelativeTime } from "@/admin/utils/formatDateTime";

interface AdminTopbarProps {
  lastSync?: Date | string | null;
  onRefresh?: () => void;
  unreadAlerts?: number;
  onMenuClick?: () => void;
}

export default function AdminTopbar({
  lastSync,
  onRefresh,
  unreadAlerts = 0,
  onMenuClick,
}: AdminTopbarProps) {
  const [searchFocused, setSearchFocused] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-950 md:gap-4 md:px-6">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 lg:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}
      <div
        className={`relative min-w-0 flex-1 max-w-md transition-all ${
          searchFocused ? "max-w-lg" : ""
        }`}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search users, files, IDs..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none transition-colors focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20"
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          Production
        </span>
        {lastSync && (
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Synced {formatRelativeTime(lastSync)}
          </span>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        <Link
          href="/admin/alerts"
          className="relative rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
          aria-label="Alerts"
        >
          <Bell className="h-4 w-4" />
          {unreadAlerts > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unreadAlerts > 99 ? "99+" : unreadAlerts}
            </span>
          )}
        </Link>

        <div className="relative">
          <button
            type="button"
            onClick={() => setAccountOpen((o) => !o)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-cyan/30 dark:text-bizzi-cyan">
              A
            </div>
            <ChevronDown className="h-4 w-4" />
          </button>
          {accountOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setAccountOpen(false)}
                aria-hidden
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <Link
                  href="/dashboard"
                  className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  onClick={() => setAccountOpen(false)}
                >
                  Back to Dashboard
                </Link>
                <Link
                  href="/login"
                  className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  onClick={() => setAccountOpen(false)}
                >
                  Sign out
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
