"use client";

import Image from "next/image";
import Link from "next/link";
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
  X,
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
      { href: "/admin/files", label: "Files", icon: FileStack },
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

  const NavContent = (
    <>
      <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-3 dark:border-neutral-800">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2" onClick={onMobileClose}>
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="font-semibold text-neutral-900 dark:text-white">
              Admin
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 lg:block hidden"
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
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 lg:hidden"
            aria-label="Close menu"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
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
    </>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-neutral-200 bg-white shadow-xl transition-transform duration-200 ease-out dark:border-neutral-800 dark:bg-neutral-950 lg:static lg:z-auto lg:ml-0 lg:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${collapsed ? "lg:w-16" : "lg:w-56"}`}
      >
      <div className="flex h-14 items-center justify-between border-b border-neutral-200 px-3 dark:border-neutral-800">
        {!collapsed && (
          <Link href="/admin" className="flex items-center gap-2" onClick={onMobileClose}>
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={24}
              height={24}
              className="object-contain"
            />
            <span className="font-semibold text-neutral-900 dark:text-white">
              Admin
            </span>
          </Link>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 lg:block dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
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
            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 lg:hidden dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
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
