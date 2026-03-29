"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  FolderOpen,
  Share2,
  Trash2,
  Send,
  Search,
  Settings,
  Menu,
  X,
  Images,
  Film,
  HardDrive,
} from "lucide-react";
import UserMenu from "@/components/dashboard/UserMenu";
import NotificationBell from "@/components/collaboration/NotificationBell";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";

interface DesktopTopNavbarProps {
  mountPanelOpen?: boolean;
  onMountPanelToggle?: () => void;
}

/** Powerup colors matching pricing cards */
const CREATOR_COLOR = "#A47BFF"; // Editor purple
const GALLERIES_COLOR = "#ECA000"; // Gallery Suite yellow

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  requiresGallerySuite?: boolean;
  requiresEditor?: boolean;
  activeBgColor?: string;
}> = [
  { href: "/desktop/app", label: "Home", icon: Home },
  { href: "/desktop/app/files", label: "All files", icon: FolderOpen },
  { href: "/desktop/app/creator", label: "Creator", icon: Film, requiresEditor: true, activeBgColor: CREATOR_COLOR },
  { href: "/desktop/app/galleries", label: "Galleries", icon: Images, requiresGallerySuite: true, activeBgColor: GALLERIES_COLOR },
  { href: "/desktop/app/shared", label: "Shared", icon: Share2 },
  { href: "/desktop/app/transfers", label: "Transfers", icon: Send },
  { href: "/desktop/app/trash", label: "Deleted files", icon: Trash2 },
  { href: "/desktop/app/settings", label: "Settings", icon: Settings },
];

export default function DesktopTopNavbar({
  mountPanelOpen = true,
  onMountPanelToggle,
}: DesktopTopNavbarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { hasGallerySuite, hasEditor } = useEffectivePowerUps();

  const filteredItems = navItems.filter((item) => {
    if (item.requiresGallerySuite && !hasGallerySuite) return false;
    if (item.requiresEditor && !hasEditor) return false;
    return true;
  });

  const inactiveNavCls =
    "border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80 dark:hover:text-white";

  const activeNavCls =
    "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 font-medium text-neutral-900 dark:text-white";

  return (
    <header className="sticky top-0 z-[60] flex h-14 flex-shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-6 md:px-6">
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <div className="flex flex-shrink-0 items-center gap-2">
      {onMountPanelToggle && (
        <button
          type="button"
          onClick={onMountPanelToggle}
          className={`rounded-lg p-2 transition-colors ${
            mountPanelOpen
              ? "bg-[var(--enterprise-primary)]/10 text-[var(--enterprise-primary)] dark:bg-[var(--enterprise-primary)]/20 dark:text-[var(--enterprise-accent)]"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
          title={mountPanelOpen ? "Hide NLE Mount panel" : "Show NLE Mount panel"}
          aria-label={mountPanelOpen ? "Hide NLE Mount panel" : "Show NLE Mount panel"}
        >
          <HardDrive className="h-5 w-5" />
        </button>
      )}
      <Link
        href="/desktop/app"
        className="flex items-center gap-2"
        onClick={() => setMobileOpen(false)}
      >
        <Image
          src="/logo.png"
          alt="Bizzi Byte"
          width={24}
          height={24}
          className="object-contain"
        />
        <span className="font-semibold text-base tracking-tight text-neutral-900 dark:text-white">
          Bizzi <span className="text-[var(--enterprise-primary)]">Cloud</span>
        </span>
      </Link>
      </div>

      <nav className="hidden md:flex items-center gap-0.5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/desktop/app" && pathname.startsWith(`${item.href}/`));
          const hasPowerupColor = isActive && item.activeBgColor;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                hasPowerupColor
                  ? "border-transparent font-medium text-white"
                  : isActive
                    ? activeNavCls
                    : inactiveNavCls
              }`}
              style={hasPowerupColor ? { backgroundColor: item.activeBgColor } : undefined}
            >
              <Icon
                className={`h-4 w-4 flex-shrink-0 ${
                  hasPowerupColor ? "text-white" : "text-[var(--enterprise-primary)]"
                }`}
              />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className={`relative flex-1 min-w-0 max-w-xl transition-all ${
          searchFocused ? "flex-[1.5]" : ""
        }`}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search files..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none transition-colors focus:border-[var(--enterprise-primary)] focus:ring-1 focus:ring-[var(--enterprise-primary)]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500 dark:focus:border-[var(--enterprise-accent)] dark:focus:ring-[var(--enterprise-accent)]/20"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-1">
        <NotificationBell />
        <UserMenu compact basePath="/desktop/app" />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`fixed left-0 right-0 top-14 z-50 transform border-b border-neutral-200 bg-white transition-transform duration-200 ease-out md:hidden dark:border-neutral-800 dark:bg-neutral-950 ${
          mobileOpen
            ? "translate-y-0 pointer-events-auto"
            : "-translate-y-full pointer-events-none opacity-0"
        }`}
        aria-hidden={!mobileOpen}
      >
        <ul className="max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/desktop/app" && pathname.startsWith(`${item.href}/`));
            const hasPowerupColor = isActive && item.activeBgColor;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    hasPowerupColor
                      ? "border-transparent font-medium text-white"
                      : isActive
                        ? activeNavCls
                        : inactiveNavCls
                  }`}
                  style={hasPowerupColor ? { backgroundColor: item.activeBgColor } : undefined}
                >
                  <Icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      hasPowerupColor ? "text-white" : "text-[var(--enterprise-primary)]"
                    }`}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
