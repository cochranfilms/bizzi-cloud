"use client";

import { useState, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { PanelRight } from "lucide-react";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import TopNavbar from "./TopNavbar";
import RightPanel from "./RightPanel";
import PendingInvitesBanner from "./PendingInvitesBanner";
import TeamBrandingOnboardingGate from "./TeamBrandingOnboardingGate";
import BackgroundUploadIndicator from "./BackgroundUploadIndicator";
import SupportHelpButton from "./SupportHelpButton";
import GlobalDropZone from "./GlobalDropZone";
import { UppyUploadProvider } from "@/context/UppyUploadContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { resolveDashboardChromeThemeVariables } from "@/lib/dashboard-chrome-theme";

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
  const teamWs = usePersonalTeamWorkspace();
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
    <UppyUploadProvider>
      <GlobalDropZone />
      <RightPanelContext.Provider
        value={{ rightPanelOpen, setRightPanelOpen }}
      >
        <div
          className={`flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950 ${
            teamWs ? "border-l-4 border-[var(--enterprise-primary)]" : ""
          }`}
          data-team-theme={effectiveUiTheme}
          style={{ ...themeVars, ...cssVariables } as React.CSSProperties}
        >
        {/* Top navbar - main nav */}
        <TopNavbar />
        <TeamBrandingOnboardingGate />
        <PendingInvitesBanner />
        <BackgroundUploadIndicator />
        <SupportHelpButton />

        {/* Mobile right panel overlay */}
        {rightPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setRightPanelOpen(false)}
            aria-hidden
          />
        )}

        {/* Main content + right panel row */}
        <div className="flex min-h-0 min-w-0 flex-1">
          {/* Main content */}
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
  );
}
