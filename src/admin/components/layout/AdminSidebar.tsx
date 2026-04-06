"use client";

import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Users,
  HardDrive,
  DollarSign,
  Bell,
  FileStack,
  Upload,
  MessageSquare,
  ScrollText,
  Settings,
  ChevronLeft,
  ChevronRight,
  Activity,
  Building2,
  Archive,
  Layers,
} from "lucide-react";
import { mapSeverityToBadge } from "@/admin/utils/mapSeverityToBadge";

const navGroups = [
  {
    label: "Core",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/storage", label: "Storage", icon: HardDrive },
      { href: "/admin/revenue", label: "Revenue", icon: DollarSign },
      { href: "/admin/alerts", label: "Alerts", icon: Bell },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/organizations", label: "Organizations", icon: Building2 },
      { href: "/admin/platform-data", label: "Platform data", icon: Layers },
      { href: "/admin/files", label: "Files", icon: FileStack },
      { href: "/admin/cold-storage", label: "Cold Storage", icon: Archive },
      { href: "/admin/uploads", label: "Upload Analytics", icon: Upload },
      { href: "/admin/support", label: "Support", icon: MessageSquare },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText },
    ],
  },
  {
    label: "System",
    items: [{ href: "/admin/settings", label: "Settings", icon: Settings }],
  },
];

interface AdminSidebarProps {
  systemStatus?: "healthy" | "warning" | "critical";
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function AdminSidebar({
  systemStatus = "healthy",
  mobileOpen = false,
  onMobileClose,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const badge = mapSeverityToBadge(
    systemStatus === "critical"
      ? "critical"
      : systemStatus === "warning"
        ? "warning"
        : "healthy"
  );

  return (
    <>
      {/* Mobile overlay - click to close drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      {/* Desktop: relative so content shifts. Mobile: fixed overlay that slides in. */}
      <aside
        className={`flex shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950
          max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:w-64 max-lg:shadow-xl max-lg:transition-transform max-lg:duration-200
          ${mobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}
          lg:relative lg:z-auto lg:translate-x-0 lg:shadow-none
          ${collapsed ? "lg:w-16" : "lg:w-56"}`}
      >
      <div className="flex h-14 min-w-0 items-center justify-between border-b border-neutral-200 px-3 dark:border-neutral-800">
        {!collapsed && (
          <Link href="/admin" className="flex min-w-0 items-center gap-2" onClick={onMobileClose}>
            <BizziLogoMark width={24} height={24} className="flex-shrink-0" alt="Bizzi Cloud" />
            <span className="truncate font-semibold text-neutral-900 dark:text-white">
              Admin
            </span>
          </Link>
        )}
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 lg:flex dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <ChevronLeft className="h-5 w-5" />
            )}
          </button>
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="flex rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 lg:hidden dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              aria-label="Close menu"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onMobileClose}
                      className={`flex items-center gap-2 px-3 py-2.5 text-sm transition-colors ${
                        collapsed ? "justify-center" : ""
                      } ${
                        isActive
                          ? "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                          : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
                      }`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {!collapsed && (
        <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50">
            <Activity className="h-4 w-4 text-neutral-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                System
              </p>
              <span className={badge.className}>
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${badge.dotClassName}`}
                />
                {systemStatus}
              </span>
            </div>
          </div>
        </div>
      )}
    </aside>
    </>
  );
}
