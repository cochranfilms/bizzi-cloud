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
  Settings,
  Menu,
  X,
  Images,
  Film,
} from "lucide-react";
import UserMenu from "./UserMenu";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import NotificationBell from "@/components/collaboration/NotificationBell";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";

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
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/files", label: "All files", icon: FolderOpen },
  {
    href: "/dashboard/creator",
    label: "Creator",
    icon: Film,
    requiresEditor: true,
    activeBgColor: CREATOR_COLOR,
  },
  {
    href: "/dashboard/galleries",
    label: "Galleries",
    icon: Images,
    requiresGallerySuite: true,
    activeBgColor: GALLERIES_COLOR,
  },
  { href: "/dashboard/shared", label: "Shared", icon: Share2 },
  { href: "/dashboard/transfers", label: "Transfers", icon: Send },
  { href: "/dashboard/trash", label: "Deleted files", icon: Trash2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Home is only active on the workspace root, not on every child under /dashboard or /team/:id. */
function isNavItemActive(
  pathname: string | null,
  resolvedHref: string,
  itemHref: string,
): boolean {
  if (!pathname) return false;
  if (pathname === resolvedHref) return true;
  if (itemHref === "/dashboard") return false;
  return pathname.startsWith(`${resolvedHref}/`);
}

export default function TopNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { hasGallerySuite, hasEditor } = useEffectivePowerUps();
  const teamWs = usePersonalTeamWorkspace();

  const teamNavBase =
    typeof pathname === "string"
      ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? null)
      : null;
  const navBase = teamNavBase ?? "/dashboard";
  const mobileNavMaxH = "max-h-[calc(100vh-3.5rem)]";

  const filteredItems = navItems.filter((item) => {
    if (item.requiresGallerySuite && !hasGallerySuite) return false;
    if (item.requiresEditor && !hasEditor) return false;
    return true;
  });

  const inactiveNavCls =
    "border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80 dark:hover:text-white";

  const activeNavCls =
    "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 font-medium text-neutral-900 dark:text-white";

  const navLinkClass = (isActive: boolean, hasPowerupColor: boolean) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
      hasPowerupColor
        ? "border-transparent font-medium text-white"
        : isActive
          ? activeNavCls
          : inactiveNavCls
    }`;

  const accountTools = (
    <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5 sm:gap-2 md:gap-3">
      <NotificationBell />
      <WorkspaceSwitcher />
      <UserMenu compact />
    </div>
  );

  /**
   * Same horizontal band as `desktopNav`: `xl:pr-56` reserves Quick Access width; `1fr auto 1fr`
   * keeps the title truly centered in that band (not viewport-centered) despite uneven left/right chrome.
   */
  const headerTopRowGridCls =
    "grid min-h-12 w-full min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-2 md:min-h-0 md:gap-3 xl:pr-56";

  /**
   * Same band as title row: `xl:pr-56` aligns with Quick Access. `1fr_auto_1fr` keeps nav centered
   * while bell / workspace / profile sit on the far right above the docked panel.
   */
  const desktopNav = (
    <div className="hidden w-full min-w-0 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-x-4 md:gap-y-1 lg:gap-x-10 xl:pr-56">
      <div className="min-w-0" aria-hidden />
      <div className="mx-auto flex w-full min-w-0 max-w-4xl justify-center justify-self-center">
        <nav
          className="-mx-1 flex min-h-9 min-w-0 max-w-full flex-nowrap justify-center gap-0.5 overflow-x-auto overflow-y-visible px-1 pb-0.5 [scrollbar-width:thin]"
          aria-label="Workspace"
        >
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const href =
              teamNavBase && item.href === "/dashboard/settings"
                ? `${teamNavBase}/settings`
                : item.href.replace(/^\/dashboard/, navBase);
            const isActive = isNavItemActive(pathname, href, item.href);
            const hasPowerupColor = isActive && item.activeBgColor;
            return (
              <Link
                key={item.href}
                href={href}
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
      {/* Fill the right 1fr so the cluster pins flush right above Quick Access (mockup), not beside the pills */}
      <div className="flex min-w-0 w-full items-center justify-end">{accountTools}</div>
    </div>
  );

  if (teamNavBase && teamWs) {
    const homeHref = teamNavBase;
    return (
      <header className="sticky top-0 z-[60] flex flex-col gap-1.5 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-1 md:px-6 md:pb-1.5 md:pt-2">
        <div className={headerTopRowGridCls}>
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="-ml-1 shrink-0 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link
              href={homeHref}
              className="flex shrink-0 items-center"
              onClick={() => setMobileOpen(false)}
              title={teamWs.teamName}
              aria-label={`${teamWs.teamName} home`}
            >
              {teamWs.teamLogoUrl ? (
                <Image
                  src={teamWs.teamLogoUrl}
                  alt={teamWs.teamName}
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
            </Link>
          </div>
          <div className="flex min-w-0 max-w-[min(22rem,calc(100vw-9rem))] justify-center justify-self-center">
            <Link
              href={homeHref}
              className="flex min-w-0 max-w-full items-center justify-center gap-2"
              onClick={() => setMobileOpen(false)}
              title={teamWs.teamName}
            >
              <span className="truncate font-semibold text-sm tracking-tight text-neutral-900 dark:text-white sm:text-base">
                {teamWs.teamName}
              </span>
              <span className="flex-shrink-0 rounded bg-[var(--enterprise-primary)]/15 px-1.5 py-0.5 text-[10px] font-medium text-[var(--enterprise-primary)] sm:px-2 sm:text-xs">
                Team
              </span>
            </Link>
          </div>
          <div className="flex min-w-0 w-full justify-end">
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
          <ul className={`${mobileNavMaxH} overflow-y-auto p-3`}>
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const href =
                teamNavBase && item.href === "/dashboard/settings"
                  ? `${teamNavBase}/settings`
                  : item.href.replace(/^\/dashboard/, navBase);
              const isActive = isNavItemActive(pathname, href, item.href);
              const hasPowerupColor = isActive && item.activeBgColor;
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      hasPowerupColor
                        ? "border-transparent font-medium text-white"
                        : isActive
                          ? activeNavCls
                          : inactiveNavCls
                    }`}
                    style={
                      hasPowerupColor
                        ? { backgroundColor: item.activeBgColor }
                        : undefined
                    }
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

  return (
    <header className="sticky top-0 z-[60] flex flex-col gap-1.5 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-1 md:px-6 md:pb-1.5 md:pt-2">
      <div className={headerTopRowGridCls}>
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="-ml-1 shrink-0 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link
            href="/"
            className="flex shrink-0 items-center"
            onClick={() => setMobileOpen(false)}
            aria-label="Bizzi Cloud home"
          >
            <Image
              src="/logo.png"
              alt="Bizzi Byte"
              width={24}
              height={24}
              className="object-contain"
            />
          </Link>
        </div>

        <div className="flex min-w-0 max-w-[min(14rem,calc(100vw-9rem))] justify-center justify-self-center">
          <Link
            href="/"
            className="block whitespace-nowrap text-center font-semibold text-sm tracking-tight text-neutral-900 dark:text-white sm:text-base"
            onClick={() => setMobileOpen(false)}
          >
            Bizzi <span className="text-[var(--enterprise-primary)]">Cloud</span>
          </Link>
        </div>

        <div className="flex min-w-0 w-full justify-end">
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
        <ul className={`${mobileNavMaxH} overflow-y-auto p-3`}>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const href =
              teamNavBase && item.href === "/dashboard/settings"
                ? `${teamNavBase}/settings`
                : item.href.replace(/^\/dashboard/, navBase);
            const isActive = isNavItemActive(pathname, href, item.href);
            const hasPowerupColor = isActive && item.activeBgColor;
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    hasPowerupColor
                      ? "border-transparent font-medium text-white"
                      : isActive
                        ? activeNavCls
                        : inactiveNavCls
                  }`}
                  style={
                    hasPowerupColor
                      ? { backgroundColor: item.activeBgColor }
                      : undefined
                  }
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
