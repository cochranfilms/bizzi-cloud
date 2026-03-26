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

export default function TopNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const { hasGallerySuite, hasEditor } = useEffectivePowerUps();
  const teamWs = usePersonalTeamWorkspace();

  const teamNavBase =
    typeof pathname === "string"
      ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? null)
      : null;
  const navBase = teamNavBase ?? "/dashboard";
  const mobileOverlayTop =
    teamNavBase && teamWs ? "top-[6.25rem]" : "top-14";
  const mobileNavTop =
    teamNavBase && teamWs ? "top-[6.25rem]" : "top-14";
  const mobileNavMaxH =
    teamNavBase && teamWs
      ? "max-h-[calc(100vh-6.25rem)]"
      : "max-h-[calc(100vh-3.5rem)]";

  const filteredItems = navItems.filter((item) => {
    if (item.requiresGallerySuite && !hasGallerySuite) return false;
    if (item.requiresEditor && !hasEditor) return false;
    return true;
  });

  const inactiveNavCls = teamNavBase && teamWs
    ? "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white";

  const activeNavCls = teamNavBase && teamWs
    ? "bg-[var(--enterprise-primary)]/10 font-medium text-[var(--enterprise-primary)]"
    : "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan";

  const searchFocusCls = teamNavBase && teamWs
    ? "focus:border-[var(--enterprise-primary)] focus:ring-1 focus:ring-[var(--enterprise-primary)]/20 dark:focus:border-[var(--enterprise-accent)] dark:focus:ring-[var(--enterprise-accent)]/20"
    : "focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/20 dark:focus:border-bizzi-cyan dark:focus:ring-bizzi-cyan/20";

  const navRow = (
    <>
      <nav className="hidden md:flex items-center gap-0.5">
        {filteredItems.map((item) => {
          const Icon = item.icon;
          const href =
            teamNavBase && item.href === "/dashboard/settings"
              ? `${teamNavBase}/settings`
              : item.href.replace(/^\/dashboard/, navBase);
          const isActive =
            pathname === href || pathname?.startsWith(`${href}/`);
          const hasPowerupColor = isActive && item.activeBgColor;
          return (
            <Link
              key={item.href}
              href={href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                hasPowerupColor
                  ? "font-medium text-white"
                  : isActive
                    ? activeNavCls
                    : inactiveNavCls
              }`}
              style={
                hasPowerupColor ? { backgroundColor: item.activeBgColor } : undefined
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className={`relative hidden sm:block flex-1 min-w-0 max-w-xl transition-all ${
          searchFocused ? "flex-[1.5]" : ""
        }`}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search files..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className={`w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none transition-colors dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500 ${searchFocusCls}`}
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-3">
        <NotificationBell />
        <WorkspaceSwitcher />
        <UserMenu compact />
      </div>
    </>
  );

  if (teamNavBase && teamWs) {
    const homeHref = teamNavBase;
    return (
      <header className="sticky top-0 z-[60] flex flex-shrink-0 flex-col border-b border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50">
        <div className="flex min-h-[2.75rem] shrink-0 items-center px-4 md:px-6">
          <Link
            href={homeHref}
            className="flex min-w-0 flex-shrink-0 items-center gap-2"
            onClick={() => setMobileOpen(false)}
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
            <span className="truncate font-semibold text-base tracking-tight text-neutral-900 dark:text-white">
              {teamWs.teamName}
            </span>
            <span className="flex-shrink-0 rounded bg-[var(--enterprise-primary)]/15 px-2 py-0.5 text-xs font-medium text-[var(--enterprise-primary)]">
              Team
            </span>
          </Link>
        </div>

        <div className="flex h-14 shrink-0 items-center gap-4 border-t border-neutral-100 px-4 dark:border-neutral-800/60 md:gap-6 md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          {navRow}
        </div>

        {mobileOpen && (
          <div
            className={`fixed inset-0 ${mobileOverlayTop} z-40 bg-black/30 md:hidden`}
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
        <nav
          className={`fixed left-0 right-0 ${mobileNavTop} z-50 transform border-b border-neutral-200 bg-white transition-transform duration-200 ease-out md:hidden dark:border-neutral-800 dark:bg-neutral-950 ${
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
              const isActive =
                pathname === href || pathname?.startsWith(`${href}/`);
              const hasPowerupColor = isActive && item.activeBgColor;
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                      hasPowerupColor
                        ? "font-medium text-white"
                        : isActive
                          ? activeNavCls
                          : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                    }`}
                    style={
                      hasPowerupColor
                        ? { backgroundColor: item.activeBgColor }
                        : undefined
                    }
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
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
    <header className="sticky top-0 z-[60] flex h-14 flex-shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-6 md:px-6">
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <Link
        href="/"
        className="flex flex-shrink-0 items-center gap-2"
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
          Bizzi <span className="text-bizzi-blue">Cloud</span>
        </span>
      </Link>

      {navRow}

      {mobileOpen && (
        <div
          className={`fixed inset-0 ${mobileOverlayTop} z-40 bg-black/30 md:hidden`}
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`fixed left-0 right-0 ${mobileNavTop} z-50 transform border-b border-neutral-200 bg-white transition-transform duration-200 ease-out md:hidden dark:border-neutral-800 dark:bg-neutral-950 ${
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
            const isActive =
              pathname === href || pathname?.startsWith(`${href}/`);
            const hasPowerupColor = isActive && item.activeBgColor;
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    hasPowerupColor
                      ? "font-medium text-white"
                      : isActive
                        ? activeNavCls
                        : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  }`}
                  style={
                    hasPowerupColor
                      ? { backgroundColor: item.activeBgColor }
                      : undefined
                  }
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
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
