"use client";

import { useState, createContext, useContext } from "react";
import { PanelRight, HardDrive } from "lucide-react";
import { UppyUploadProvider } from "@/context/UppyUploadContext";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import DesktopTopNavbar from "./DesktopTopNavbar";
import RightPanel from "@/components/dashboard/RightPanel";
import PendingInvitesBanner from "@/components/dashboard/PendingInvitesBanner";
import BackgroundUploadIndicator from "@/components/dashboard/BackgroundUploadIndicator";
import GlobalDropZone from "@/components/dashboard/GlobalDropZone";
import { NLEMountPanel } from "./NLEMountPanel";

const RightPanelContext = createContext<{
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
} | null>(null);

export function useDesktopRightPanel() {
  const ctx = useContext(RightPanelContext);
  return ctx;
}

export default function DesktopShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [mountPanelOpen, setMountPanelOpen] = useState(true);
  const { hasEditor } = useEffectivePowerUps();
  const { cssVariables } = useDashboardAppearance();

  return (
    <UppyUploadProvider>
    <GlobalDropZone />
    <RightPanelContext.Provider value={{ rightPanelOpen, setRightPanelOpen }}>
      <div
        className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950"
        style={cssVariables}
      >
        <DesktopTopNavbar
          mountPanelOpen={hasEditor ? mountPanelOpen : false}
          onMountPanelToggle={hasEditor ? () => setMountPanelOpen((o) => !o) : undefined}
        />
        <PendingInvitesBanner />
        <BackgroundUploadIndicator />

        {rightPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setRightPanelOpen(false)}
            aria-hidden
          />
        )}

        {/* Backdrop for mount panel overlay on narrow screens */}
        {hasEditor && mountPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 md:hidden"
            onClick={() => setMountPanelOpen(false)}
            aria-hidden
          />
        )}

        <div className="flex min-h-0 min-w-0 flex-1">
          {/* NLE Mount panel: only for Bizzi Editor / Full Frame; inline on md+, slide-over on narrow */}
          {hasEditor && mountPanelOpen && (
            <aside
              className="fixed left-0 top-14 bottom-0 z-50 w-72 flex-shrink-0 flex-col border-r border-neutral-200/60 bg-white shadow-xl transition-transform duration-200 md:relative md:top-0 md:z-auto md:shadow-none md:dark:bg-transparent dark:border-neutral-800/60 dark:bg-neutral-950 translate-x-0 md:flex"
              aria-label="NLE Mount"
            >
              <div className="overflow-y-auto p-5">
                <NLEMountPanel />
              </div>
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            {/* Floating buttons on narrow screens: left = mount panel (Editor/Full Frame only), right = backup panel */}
            {hasEditor && !mountPanelOpen && (
              <div className="fixed left-4 top-16 z-30 md:hidden">
                <button
                  type="button"
                  onClick={() => setMountPanelOpen(true)}
                  className="rounded-lg bg-white p-2 shadow text-bizzi-blue hover:bg-bizzi-blue/10 dark:bg-neutral-800 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/20"
                  aria-label="Open NLE Mount panel"
                  title="Mount Drive"
                >
                  <HardDrive className="h-5 w-5" />
                </button>
              </div>
            )}
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

          <div
            className={`fixed bottom-0 right-0 top-14 z-40 w-56 transform transition-transform xl:static xl:top-0 xl:min-h-0 xl:translate-x-0 ${
              rightPanelOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
            }`}
          >
            <RightPanel
              basePath="/desktop/app"
              onMobileClose={() => setRightPanelOpen(false)}
            />
          </div>
        </div>
      </div>
    </RightPanelContext.Provider>
    </UppyUploadProvider>
  );
}
