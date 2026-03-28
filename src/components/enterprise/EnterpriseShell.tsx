"use client";

import { useState } from "react";
import { PanelRight } from "lucide-react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useDashboardAppearance } from "@/context/DashboardAppearanceContext";
import { UppyUploadProvider } from "@/context/UppyUploadContext";
import EnterpriseNavbar from "./EnterpriseNavbar";
import RightPanel from "@/components/dashboard/RightPanel";
import EnterpriseStorageBadge from "./EnterpriseStorageBadge";
import PendingInvitesBanner from "@/components/dashboard/PendingInvitesBanner";
import BackgroundUploadIndicator from "@/components/dashboard/BackgroundUploadIndicator";
import SupportHelpButton from "@/components/dashboard/SupportHelpButton";
import GlobalDropZone from "@/components/dashboard/GlobalDropZone";
import { getThemeVariables } from "@/lib/enterprise-themes";

export default function EnterpriseShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org, role } = useEnterprise();
  const { cssVariables, uiThemeOverride } = useDashboardAppearance();
  const theme = uiThemeOverride ?? org?.theme ?? "bizzi";
  const orgVars = getThemeVariables(theme);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);

  return (
    <UppyUploadProvider>
    <GlobalDropZone />
    <div
      className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950 border-l-4 border-[var(--enterprise-primary)]"
      data-org-theme={theme}
      data-context="enterprise"
      style={{ ...orgVars, ...cssVariables } as React.CSSProperties}
    >
      <EnterpriseNavbar />
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
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="fixed z-30 xl:hidden left-[max(0.75rem,env(safe-area-inset-left))] top-36 md:top-[6.75rem]">
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

        <div
          className={`fixed bottom-0 right-0 top-36 z-40 w-56 transform transition-transform md:top-[6.25rem] xl:static xl:top-0 xl:min-h-0 xl:translate-x-0 ${
            rightPanelOpen ? "translate-x-0" : "translate-x-full xl:translate-x-0"
          }`}
        >
          <RightPanel
            basePath="/enterprise"
            commentsHref={role === "admin" ? "/enterprise/comments" : undefined}
            storageComponent={<EnterpriseStorageBadge />}
            onMobileClose={() => setRightPanelOpen(false)}
          />
        </div>
      </div>
    </div>
    </UppyUploadProvider>
  );
}
