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
  Lock,
} from "lucide-react";
import UserMenu from "./UserMenu";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import NotificationBell from "@/components/collaboration/NotificationBell";
import BizziLogoMark from "@/components/BizziLogoMark";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

/** Powerup colors matching pricing cards */
const CREATOR_COLOR = "#A47BFF"; // Editor purple
const GALLERIES_COLOR = "#ECA000"; // Gallery Suite yellow

/** Team owner setup mode: premium areas stay visible as locked teasers → stable upgrade path (not deep links). */
const TEAM_SETUP_PREMIUM_TEASER_UPGRADE_HREF =
  "/dashboard/change-plan?source=team-setup-premium";

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
  const { user } = useAuth();
  const { teamSetupMode } = useSubscription();
  const ownerTeamPremiumTeaser =
    Boolean(teamWs && user?.uid === teamWs.teamOwnerUid && teamSetupMode);

  const teamNavBase =
    typeof pathname === "string"
      ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? null)
      : null;
  const navBase = teamNavBase ?? "/dashboard";
  const mobileNavMaxH = "max-h-[calc(100vh-3.5rem)]";

  const filteredItems = navItems.filter((item) => {
    if (
      ownerTeamPremiumTeaser &&
      (item.requiresGallerySuite || item.requiresEditor)
    ) {
      return true;
    }
    if (item.requiresGallerySuite && !hasGallerySuite) return false;
    if (item.requiresEditor && !hasEditor) return false;
    return true;
  });

  const premiumLockedForOwnerSetup = (item: (typeof navItems)[number]) =>
    ownerTeamPremiumTeaser &&
    Boolean(item.requiresGallerySuite || item.requiresEditor);

  function resolvedNavHref(item: (typeof navItems)[number]): string {
    if (premiumLockedForOwnerSetup(item)) return TEAM_SETUP_PREMIUM_TEASER_UPGRADE_HREF;
    return teamNavBase && item.href === "/dashboard/settings"
      ? `${teamNavBase}/settings`
      : item.href.replace(/^\/dashboard/, navBase);
  }

  const inactiveNavCls =
    "border border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:bg-neutral-800/80 dark:hover:text-white";

  const activeNavCls =
    "border border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 font-medium text-neutral-900 dark:text-white";

  const lockedTeaserNavCls =
    "border border-dashed border-neutral-300 bg-neutral-50/80 text-neutral-600 hover:border-neutral-400 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-300 dark:hover:border-neutral-500";

  const navLinkClass = (
    isActive: boolean,
    hasPowerupColor: boolean,
    lockedTeaser: boolean
  ) =>
    `flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm ${
      lockedTeaser
        ? lockedTeaserNavCls
        : hasPowerupColor
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

  /** Logo + rail mirror DashboardShell (`flex-1` main + `xl:w-56` Quick Access). */
  const headerTopRowFlexCls =
    "flex min-h-12 w-full min-w-0 items-center gap-2 md:min-h-0 md:gap-3";

  /** Title row + this row share the same split; nav stays centered over the primary column. */
  const desktopNav = (
    <div className="hidden w-full min-w-0 md:flex md:items-center">
      <div className="flex min-h-9 min-w-0 flex-1 justify-center overflow-hidden px-1 sm:px-2">
        <nav
          className="-mx-1 flex min-h-9 min-w-0 max-w-full flex-nowrap justify-center gap-0.5 overflow-x-auto overflow-y-visible px-1 pb-0.5 [scrollbar-width:thin]"
          aria-label="Workspace"
        >
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const href = resolvedNavHref(item);
            const lockedTeaser = premiumLockedForOwnerSetup(item);
            const isActive =
              lockedTeaser ? false : isNavItemActive(pathname, href, item.href);
            const hasPowerupColor = !lockedTeaser && isActive && item.activeBgColor;
            const teaserLabel =
              item.href === "/dashboard/creator"
                ? "Creator — add seats to use in team workspace"
                : "Galleries — add seats to use in team workspace";
            return (
              <Link
                key={item.href}
                href={href}
                className={navLinkClass(isActive, !!hasPowerupColor, lockedTeaser)}
                style={hasPowerupColor ? { backgroundColor: item.activeBgColor } : undefined}
                title={lockedTeaser ? teaserLabel : undefined}
                aria-label={lockedTeaser ? teaserLabel : undefined}
              >
                <Icon
                  className={`h-4 w-4 flex-shrink-0 ${
                    hasPowerupColor ? "text-white" : "text-[var(--enterprise-primary)]"
                  }`}
                />
                {lockedTeaser ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-500 dark:text-neutral-400" aria-hidden />
                ) : null}
                <span className="hidden lg:inline">{item.label}</span>
                {lockedTeaser ? (
                  <span className="hidden rounded bg-neutral-200/90 px-1 py-px text-[10px] font-medium text-neutral-700 lg:inline dark:bg-neutral-700 dark:text-neutral-200">
                    Add seats
                  </span>
                ) : null}
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

  if (teamNavBase && teamWs) {
    const homeHref = teamNavBase;
    return (
      <header className="sticky top-0 z-[60] flex flex-col gap-1.5 border-b border-neutral-200 bg-white px-4 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-1 md:px-6 md:pb-1.5 md:pt-2">
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
                <BizziLogoMark width={24} height={24} className="flex-shrink-0" />
              )}
            </Link>
          </div>
          <div className="flex min-w-0 flex-1 justify-center px-1">
            <Link
              href={homeHref}
              className="flex min-w-0 max-w-[min(22rem,calc(100vw-9rem))] items-center justify-center gap-2"
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
          <ul className={`${mobileNavMaxH} overflow-y-auto p-3`}>
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const href = resolvedNavHref(item);
              const lockedTeaser = premiumLockedForOwnerSetup(item);
              const isActive =
                lockedTeaser ? false : isNavItemActive(pathname, href, item.href);
              const hasPowerupColor = !lockedTeaser && isActive && item.activeBgColor;
              const teaserLabel =
                item.href === "/dashboard/creator"
                  ? "Creator — add seats to use in team workspace"
                  : "Galleries — add seats to use in team workspace";
              return (
                <li key={item.href}>
                  <Link
                    href={href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      lockedTeaser
                        ? lockedTeaserNavCls
                        : hasPowerupColor
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
                    title={lockedTeaser ? teaserLabel : undefined}
                    aria-label={lockedTeaser ? teaserLabel : undefined}
                  >
                    <Icon
                      className={`h-4 w-4 flex-shrink-0 ${
                        hasPowerupColor ? "text-white" : "text-[var(--enterprise-primary)]"
                      }`}
                    />
                    {lockedTeaser ? (
                      <Lock className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" aria-hidden />
                    ) : null}
                    {item.label}
                    {lockedTeaser ? (
                      <span className="ml-auto rounded bg-neutral-200/90 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                        Add seats
                      </span>
                    ) : null}
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
            href="/"
            className="flex shrink-0 items-center"
            onClick={() => setMobileOpen(false)}
            aria-label="Bizzi Cloud home"
          >
            <BizziLogoMark width={24} height={24} />
          </Link>
        </div>

        <div className="flex min-w-0 flex-1 justify-center px-1">
          <Link
            href="/"
            className="block max-w-[min(14rem,calc(100vw-9rem))] whitespace-nowrap text-center font-semibold text-sm tracking-tight text-neutral-900 dark:text-white sm:text-base"
            onClick={() => setMobileOpen(false)}
          >
            Bizzi <span className="text-[var(--enterprise-primary)]">Cloud</span>
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
        <ul className={`${mobileNavMaxH} overflow-y-auto p-3`}>
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const href = resolvedNavHref(item);
            const lockedTeaser = premiumLockedForOwnerSetup(item);
            const isActive =
              lockedTeaser ? false : isNavItemActive(pathname, href, item.href);
            const hasPowerupColor = !lockedTeaser && isActive && item.activeBgColor;
            const teaserLabel =
              item.href === "/dashboard/creator"
                ? "Creator — add seats to use in team workspace"
                : "Galleries — add seats to use in team workspace";
            return (
              <li key={item.href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    lockedTeaser
                      ? lockedTeaserNavCls
                      : hasPowerupColor
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
                  title={lockedTeaser ? teaserLabel : undefined}
                  aria-label={lockedTeaser ? teaserLabel : undefined}
                >
                  <Icon
                    className={`h-4 w-4 flex-shrink-0 ${
                      hasPowerupColor ? "text-white" : "text-[var(--enterprise-primary)]"
                    }`}
                  />
                  {lockedTeaser ? (
                    <Lock className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400" aria-hidden />
                  ) : null}
                  {item.label}
                  {lockedTeaser ? (
                    <span className="ml-auto rounded bg-neutral-200/90 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                      Add seats
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
