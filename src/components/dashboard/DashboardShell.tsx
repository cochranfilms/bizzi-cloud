"use client";

import { useState, createContext, useContext } from "react";
import { usePathname } from "next/navigation";
import { PanelRight } from "lucide-react";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import TopNavbar from "./TopNavbar";
import RightPanel from "./RightPanel";
import PendingInvitesBanner from "./PendingInvitesBanner";
import BackgroundUploadIndicator from "./BackgroundUploadIndicator";
import SupportHelpButton from "./SupportHelpButton";
import GlobalDropZone from "./GlobalDropZone";
import { UppyUploadProvider } from "@/context/UppyUploadContext";

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
  const { cssVariables } = useDashboardAppearance();
  const pathname = usePathname();
  const teamNavBase =
    typeof pathname === "string" ? (/^(\/team\/[^/]+)/.exec(pathname)?.[1] ?? null) : null;
  const rightPanelBasePath = teamNavBase ?? "/dashboard";

  return (
    <UppyUploadProvider>
      <GlobalDropZone />
      <RightPanelContext.Provider
        value={{ rightPanelOpen, setRightPanelOpen }}
      >
        <div
          className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950"
          style={cssVariables}
        >
        {/* Top navbar - main nav */}
        <TopNavbar />
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
            <div className="fixed right-4 top-16 z-30 xl:hidden">
              <button
                type="button"
                className="rounded-lg bg-white p-2 shadow dark:bg-neutral-800"
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
            className={`fixed bottom-0 right-0 top-14 z-40 w-56 transform transition-transform xl:static xl:top-0 xl:min-h-0 xl:translate-x-0 ${
              rightPanelOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
            }`}
          >
            <RightPanel
              basePath={rightPanelBasePath}
              onMobileClose={() => setRightPanelOpen(false)}
            />
          </div>
        </div>
      </div>
    </RightPanelContext.Provider>
    </UppyUploadProvider>
  );
}
