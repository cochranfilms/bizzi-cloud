"use client";

import { useState, createContext, useContext } from "react";
import { Menu, PanelRight } from "lucide-react";
import Sidebar from "./Sidebar";
import RightPanel from "./RightPanel";

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <RightPanelContext.Provider
      value={{ rightPanelOpen, setRightPanelOpen }}
    >
      <div className="flex h-screen overflow-hidden bg-neutral-100 dark:bg-neutral-950">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        {/* Mobile right panel overlay */}
        {rightPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 xl:hidden"
            onClick={() => setRightPanelOpen(false)}
            aria-hidden
          />
        )}

        {/* Left sidebar - main nav */}
        <div
          className={`fixed inset-y-0 left-0 z-50 h-full w-56 transform transition-transform lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile menu buttons */}
          <div className="fixed left-4 top-4 z-30 flex gap-2 lg:hidden">
            <button
              type="button"
              className="rounded-lg bg-white p-2 shadow dark:bg-neutral-800"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <button
              type="button"
              className="rounded-lg bg-white p-2 shadow xl:hidden dark:bg-neutral-800"
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
          className={`fixed inset-y-0 right-0 z-50 w-56 transform transition-transform xl:static xl:translate-x-0 ${
            rightPanelOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
          }`}
        >
          <RightPanel onMobileClose={() => setRightPanelOpen(false)} />
        </div>
      </div>
    </RightPanelContext.Provider>
  );
}
