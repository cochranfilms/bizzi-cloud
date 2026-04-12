"use client";

import { useState, createContext, useContext, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { PanelRight } from "lucide-react";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import TopNavbar from "./TopNavbar";
import RightPanel from "./RightPanel";
import PendingInvitesBanner from "./PendingInvitesBanner";
import TeamBrandingOnboardingGate from "./TeamBrandingOnboardingGate";
import WorkspaceOnboardingEnforcement from "./WorkspaceOnboardingEnforcement";
import BackgroundUploadIndicator from "./BackgroundUploadIndicator";
import GlobalDropZone from "./GlobalDropZone";
import { FilesFilterTopChromeProvider } from "@/context/FilesFilterTopChromeContext";
import { UppyUploadProvider } from "@/context/UppyUploadContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import Link from "next/link";
import { resolveDashboardChromeThemeVariables } from "@/lib/dashboard-chrome-theme";
import {
  dashboardPerfMarks,
  markDashboardPerf,
} from "@/lib/dashboard-client-timing";

const RightPanelContext = createContext<{
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
} | null>(null);

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  return ctx;
}

export default function DashboardShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const { cssVariables, uiThemeOverride, buttonColor } = useDashboardAppearance();
  const pathname = usePathname();
  const shellMarkOnce = useRef(false);
  useLayoutEffect(() => {
    if (shellMarkOnce.current) return;
    if (typeof pathname !== "string" || !pathname.startsWith("/dashboard")) return;
    shellMarkOnce.current = true;
    markDashboardPerf(dashboardPerfMarks.shellLayout);
  }, [pathname]);
  const teamWs = usePersonalTeamWorkspace();
  const { user } = useAuth();
  const { teamSetupMode } = useSubscription();
  const showTeamSetupBanner = Boolean(
    teamWs && user?.uid === teamWs.teamOwnerUid && teamSetupMode
  );
  const teamNavBase =
    typeof pathname === "string" ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? null) : null;
  const rightPanelBasePath = teamNavBase ?? "/dashboard";
  const commentsHref = teamNavBase ? `${teamNavBase}/comments` : undefined;
  const inheritedUiTheme = teamWs ? teamWs.teamThemeId : "bizzi";
  const effectiveUiTheme = uiThemeOverride ?? inheritedUiTheme;
  const themeVars = resolveDashboardChromeThemeVariables(
    inheritedUiTheme,
    buttonColor,
    uiThemeOverride,
  );
  /** Right panel sits below the sticky header (single-row team + personal nav match). */
  const stackedNavTop = "top-14";
  const mobilePanelBtnTop = "top-20 md:top-16";

  return (
    <WorkspaceOnboardingEnforcement>
    <UppyUploadProvider>
      <GlobalDropZone />
      <RightPanelContext.Provider
        value={{ rightPanelOpen, setRightPanelOpen }}
      >
        <div
          className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950"
          data-team-theme={effectiveUiTheme}
          style={{ ...themeVars, ...cssVariables } as React.CSSProperties}
        >
        {/* Top navbar - main nav */}
        <TopNavbar />
        {showTeamSetupBanner ? (
          <div
            role="status"
            className="shrink-0 border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100 sm:text-sm"
          >
            <span className="font-medium">Team setup mode.</span> Gallery and Creator show as locked shortcuts
            to your plan page until you add team seats. Team shared storage is limited to 5&nbsp;GB until
            then.{" "}
            <Link
              href="/dashboard/change-plan"
              className="font-medium underline decoration-amber-700/60 underline-offset-2 hover:text-amber-900 dark:hover:text-amber-50"
            >
              Add team seats
            </Link>
          </div>
        ) : null}
        <TeamBrandingOnboardingGate />
        <PendingInvitesBanner />
        <BackgroundUploadIndicator />

        {/* Mobile right panel overlay */}
        {rightPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setRightPanelOpen(false)}
            aria-hidden
          />
        )}

        {/* Main content + right panel row */}
        <div className="flex min-h-0 min-w-0 flex-1 gap-0 xl:gap-7">
          {/* Main vs workspace rail: xl-only gap widens the “lane” so page scroll isn’t confused with embedded panes */}
          <FilesFilterTopChromeProvider>
            <div className="flex min-w-0 flex-1 flex-col">
              {/* Mobile panel button */}
              <div
                className={`fixed z-30 xl:hidden left-[max(0.75rem,env(safe-area-inset-left))] ${mobilePanelBtnTop}`}
              >
                <button
                  type="button"
                  className="rounded-lg bg-white p-2 shadow-md ring-1 ring-neutral-200/80 dark:bg-neutral-800 dark:ring-neutral-700"
                  onClick={() => setRightPanelOpen(true)}
                  aria-label="Open panel"
                >
                  <PanelRight className="h-5 w-5" />
                </button>
              </div>

              {children}
            </div>
          </FilesFilterTopChromeProvider>

          {/* Right panel - desktop: always visible on xl; mobile: slide-out */}
          <div
            className={`fixed bottom-0 right-0 z-40 w-56 transform transition-transform xl:static xl:top-0 xl:min-h-0 xl:translate-x-0 ${stackedNavTop} ${
              rightPanelOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
            }`}
          >
            <RightPanel
              basePath={rightPanelBasePath}
              commentsHref={commentsHref}
              onMobileClose={() => setRightPanelOpen(false)}
            />
          </div>
        </div>
        </div>
      </RightPanelContext.Provider>
    </UppyUploadProvider>
    </WorkspaceOnboardingEnforcement>
  );
}
