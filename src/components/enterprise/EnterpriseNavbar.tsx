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
  Users,
  Settings,
  Menu,
  X,
  Search,
  Film,
  Images,
} from "lucide-react";
import UserMenu from "@/components/dashboard/UserMenu";
import WorkspaceSwitcher from "@/components/dashboard/WorkspaceSwitcher";
import NotificationBell from "@/components/collaboration/NotificationBell";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";

/** Powerup colors matching pricing cards */
const CREATOR_COLOR = "#A47BFF"; // Editor purple
const GALLERIES_COLOR = "#ECA000"; // Gallery Suite yellow

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  requiresEditor?: boolean;
  requiresGallerySuite?: boolean;
  activeBgColor?: string;
}> = [
  { href: "/enterprise", label: "Home", icon: Home },
  { href: "/enterprise/files", label: "All files", icon: FolderOpen },
  { href: "/enterprise/creator", label: "Creator", icon: Film, requiresEditor: true, activeBgColor: CREATOR_COLOR },
  { href: "/enterprise/galleries", label: "Galleries", icon: Images, requiresGallerySuite: true, activeBgColor: GALLERIES_COLOR },
  { href: "/enterprise/shared", label: "Shared", icon: Share2 },
  { href: "/enterprise/transfers", label: "Transfers", icon: Send },
  { href: "/enterprise/trash", label: "Deleted files", icon: Trash2 },
  { href: "/enterprise/seats", label: "Seats", icon: Users },
  { href: "/enterprise/settings", label: "Settings", icon: Settings },
];

export default function EnterpriseNavbar() {
  const pathname = usePathname();
  const { org } = useEnterprise();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();

  const filteredNavItems = navItems.filter((item) => {
    if (item.requiresEditor && !hasEditor) return false;
    if (item.requiresGallerySuite && !hasGallerySuite) return false;
    return true;
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const logoUrl = org?.logo_url;
  const theme = org?.theme ?? "bizzi";

  const inactiveNavCls =
    "border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80 dark:hover:text-white";

  const activeNavCls =
    "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 font-medium text-neutral-900 dark:text-white";

  return (
    <header
      className="sticky top-0 z-50 flex min-h-14 flex-shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:h-14 md:flex-nowrap md:gap-6 md:py-0 md:px-6"
      data-org-theme={theme}
    >
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <Link
        href="/enterprise"
        className="flex min-w-0 max-w-[min(100%,18rem)] shrink items-center gap-2 sm:max-w-[20rem] md:max-w-[min(22rem,32vw)]"
        onClick={() => setMobileOpen(false)}
        title={org?.name ?? "Enterprise"}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={org?.name ?? "Organization"}
            width={24}
            height={24}
            className="h-6 w-6 flex-shrink-0 object-contain"
            unoptimized
          />
        ) : (
          <Image
            src="/logo.png"
            alt="Bizzi Byte"
            width={24}
            height={24}
            className="flex-shrink-0 object-contain"
          />
        )}
        <span className="truncate font-semibold text-base tracking-tight text-neutral-900 dark:text-white">
          {org?.name ?? "Enterprise"}
        </span>
        <span
          className="flex-shrink-0 rounded bg-[var(--enterprise-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--enterprise-primary)]"
          aria-label="Enterprise workspace"
        >
          Enterprise
        </span>
      </Link>

      <nav className="hidden items-center gap-0.5 md:flex">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/enterprise" && pathname.startsWith(item.href));
          const hasPowerupColor = isActive && item.activeBgColor;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors enterprise-nav-link ${
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

      <div className="order-2 ml-auto flex shrink-0 items-center gap-2 md:order-none md:ml-0 md:gap-3">
        <NotificationBell />
        <WorkspaceSwitcher />
        <UserMenu compact />
      </div>

      <div
        className={`relative order-3 w-full min-w-0 basis-full transition-all md:order-none md:max-w-xl md:flex-1 ${
          searchFocused ? "md:flex-[1.5]" : ""
        }`}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search files..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none transition-colors focus:border-[var(--enterprise-primary)] focus:ring-1 focus:ring-[var(--enterprise-primary)]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
        />
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
          {filteredNavItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/enterprise" && pathname.startsWith(item.href));
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
