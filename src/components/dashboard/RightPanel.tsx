"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Heart,
  Clock,
  FolderKanban,
  Activity,
  Share2,
  MessageCircle,
} from "lucide-react";
import StorageBadge from "./StorageBadge";
import SyncDriveButton from "./SyncDriveButton";

const quickAccessItems = (basePath: string) => [
  { href: `${basePath}/hearts`, label: "Hearts", icon: Heart },
  { href: `${basePath}/recent`, label: "Recent", icon: Clock },
  { href: `${basePath}/projects`, label: "Projects", icon: FolderKanban },
];

interface RightPanelProps {
  onMobileClose?: () => void;
  /** Base path for links (e.g. /dashboard or /enterprise). Default: /dashboard */
  basePath?: string;
  /** When set, shows a Quick access link (org / team file comment activity). */
  commentsHref?: string;
  /** Optional custom storage component (e.g. EnterpriseStorageBadge). Default: StorageBadge */
  storageComponent?: React.ReactNode;
}

export default function RightPanel({
  onMobileClose,
  basePath = "/dashboard",
  commentsHref,
  storageComponent,
}: RightPanelProps) {
  const pathname = usePathname();
  const items = quickAccessItems(basePath);

  return (
    <aside className="flex h-full w-full max-w-[min(20rem,100vw-2rem)] flex-shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:w-56 xl:max-w-none xl:shadow-none dark:border-neutral-800 dark:bg-neutral-950">
      {/* Quick access */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Quick access
        </h3>
        <ul className="space-y-0.5">
          {items.map((item) => {
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
          {commentsHref ? (
            <li key={commentsHref}>
              <Link
                href={commentsHref}
                onClick={onMobileClose}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  pathname === commentsHref
                    ? "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan"
                    : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                }`}
              >
                <MessageCircle className="h-4 w-4 flex-shrink-0" />
                Comments
              </Link>
            </li>
          ) : null}
        </ul>
      </div>

      {/* Activity */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href={`${basePath}/activity`}
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
          href={`${basePath}/shared`}
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Share2 className="h-4 w-4" />
          Shared with you
        </Link>
      </div>

      {/* Storage - in main area above Backup */}
      <div className="flex-1 min-h-0 overflow-auto border-b border-neutral-200 dark:border-neutral-800">
        <div className="p-4 h-full">
          {storageComponent ?? <StorageBadge />}
        </div>
      </div>

      {/* Backup / Sync - fills remaining space */}
      <div className="flex flex-1 flex-col border-t border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Backup
        </h3>
        <SyncDriveButton />
      </div>
    </aside>
  );
}
