"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Star,
  Clock,
  FolderKanban,
  Activity,
  Share2,
} from "lucide-react";
import StorageBadge from "./StorageBadge";
import SyncDriveButton from "./SyncDriveButton";

const quickAccessItems = [
  { href: "/dashboard/starred", label: "Starred", icon: Star },
  { href: "/dashboard/recent", label: "Recent", icon: Clock },
  { href: "/dashboard/projects", label: "Projects", icon: FolderKanban },
];

interface RightPanelProps {
  onMobileClose?: () => void;
}

export default function RightPanel({ onMobileClose }: RightPanelProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950 xl:shadow-none">
      {/* Quick access */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Quick access
        </h3>
        <ul className="space-y-0.5">
          {quickAccessItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Activity */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href="/dashboard/activity"
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Activity className="h-4 w-4" />
          Activity
        </Link>
      </div>

      {/* Shared shortcut */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href="/dashboard/shared"
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Share2 className="h-4 w-4" />
          Shared with you
        </Link>
      </div>

      {/* Drag zone */}
      <div className="flex-1 p-4">
        <div className="rounded-xl border-2 border-dashed border-neutral-200 p-4 text-center dark:border-neutral-700">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Drag important items here
          </p>
        </div>
      </div>

      {/* Backup drive */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Backup
        </h3>
        <SyncDriveButton />
      </div>

      {/* Storage */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <StorageBadge />
      </div>
    </aside>
  );
}
