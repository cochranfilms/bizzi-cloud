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
  Film,
  Images,
} from "lucide-react";
import UserMenu from "@/components/dashboard/UserMenu";
import WorkspaceSwitcher from "@/components/dashboard/WorkspaceSwitcher";
import NotificationBell from "@/components/collaboration/NotificationBell";
import BizziLogoMark from "@/components/BizziLogoMark";
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

  const logoUrl = org?.logo_url;
  const theme = org?.theme ?? "bizzi";

  const inactiveNavCls =
    "border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80 dark:hover:text-white";

  const activeNavCls =
    "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 font-medium text-neutral-900 dark:text-white";

  const navLinkClass = (isActive: boolean, hasPowerupColor: boolean) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition-colors enterprise-nav-link sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
      hasPowerupColor
        ? "border-transparent font-medium text-white"
        : isActive
          ? activeNavCls
          : inactiveNavCls
    }`;

  const accountTools = (
    <div className="flex min-w-0 shrink-0 items-center justify-center gap-1.5 sm:gap-2 md:gap-3">
      <NotificationBell />
      <WorkspaceSwitcher />
      <UserMenu compact />
    </div>
  );

  /** Nav centered in main column; `xl:w-56` rail above Quick Access (matches dashboard TopNavbar). */
  const desktopNav = (
    <div className="hidden w-full min-w-0 md:flex md:items-center">
      <div className="flex min-h-9 min-w-0 flex-1 justify-center overflow-hidden px-1 sm:px-2">
        <nav
          className="-mx-1 flex min-h-9 min-w-0 max-w-full flex-nowrap justify-center gap-0.5 overflow-x-auto overflow-y-visible px-1 pb-0.5 [scrollbar-width:thin]"
          aria-label="Workspace"
        >
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
                className={navLinkClass(isActive, !!hasPowerupColor)}
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
      </div>
      <div className="flex shrink-0 items-center justify-end xl:w-56 xl:min-w-56 xl:justify-center">
        {accountTools}
      </div>
    </div>
  );

  const headerTopRowFlexCls =
    "flex min-h-12 w-full min-w-0 items-center gap-2 md:min-h-0 md:gap-3";

  return (
    <header
      className="sticky top-0 z-50 flex flex-col gap-1.5 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-1 md:px-6 md:pb-1.5 md:pt-2"
      data-org-theme={theme}
    >
      <div className={headerTopRowFlexCls}>
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="-ml-1 shrink-0 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link
            href="/enterprise"
            className="flex shrink-0 items-center"
            onClick={() => setMobileOpen(false)}
            title={org?.name ?? "Enterprise"}
            aria-label={`${org?.name ?? "Enterprise"} home`}
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
              <BizziLogoMark width={24} height={24} className="flex-shrink-0" />
            )}
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 justify-center px-1">
          <Link
            href="/enterprise"
            className="flex min-w-0 max-w-[min(24rem,calc(100vw-9rem))] items-center justify-center gap-2"
            onClick={() => setMobileOpen(false)}
            title={org?.name ?? "Enterprise"}
          >
            <span className="truncate font-semibold text-sm tracking-tight text-neutral-900 dark:text-white sm:text-base">
              {org?.name ?? "Enterprise"}
            </span>
            <span
              className="flex-shrink-0 rounded bg-[var(--enterprise-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--enterprise-primary)] sm:px-2 sm:text-xs"
              aria-label="Enterprise workspace"
            >
              Enterprise
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center justify-end xl:w-56 xl:min-w-56 xl:justify-center">
          <div className="md:hidden">{accountTools}</div>
        </div>
      </div>

      {desktopNav}

      {mobileOpen && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`fixed left-0 right-0 top-16 z-50 transform border-b border-neutral-200 bg-white transition-transform duration-200 ease-out md:hidden dark:border-neutral-800 dark:bg-neutral-950 ${
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
