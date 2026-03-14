"use client";

import { useState, createContext, useContext } from "react";
import { PanelRight } from "lucide-react";
import DesktopTopNavbar from "./DesktopTopNavbar";
import RightPanel from "@/components/dashboard/RightPanel";
import PendingInvitesBanner from "@/components/dashboard/PendingInvitesBanner";
import BackgroundUploadIndicator from "@/components/dashboard/BackgroundUploadIndicator";
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

  return (
    <RightPanelContext.Provider value={{ rightPanelOpen, setRightPanelOpen }}>
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950">
        <DesktopTopNavbar
          mountPanelOpen={mountPanelOpen}
          onMountPanelToggle={() => setMountPanelOpen((o) => !o)}
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

        <div className="flex min-h-0 min-w-0 flex-1">
          {/* NLE Mount panel - hidden on mobile, shown from md up */}
          {mountPanelOpen && (
            <aside
              className="hidden w-72 flex-shrink-0 flex-col border-r border-neutral-200/60 md:flex dark:border-neutral-800/60 dark:bg-transparent"
              aria-label="NLE Mount"
            >
              <div className="overflow-y-auto p-5">
                <NLEMountPanel />
              </div>
            </aside>
          )}

          <div className="flex min-w-0 flex-1 flex-col">
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
  );
}
