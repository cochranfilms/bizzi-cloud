"use client";

import { Suspense } from "react";
import { DashboardAppearanceProvider } from "@/context/DashboardAppearanceContext";
import { LayoutSettingsProvider } from "@/context/LayoutSettingsContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { PersonalTeamWorkspaceProvider } from "@/context/PersonalTeamWorkspaceContext";
import DashboardShell from "@/components/dashboard/DashboardShell";
import CheckoutSuccessSync from "@/components/dashboard/CheckoutSuccessSync";

export default function TeamLayoutShell({
  teamOwnerUid,
  children,
}: {
  teamOwnerUid: string;
  children: React.ReactNode;
}) {
  return (
    <EnterpriseProvider>
      <SubscriptionProvider>
        <BackupProvider>
          <CurrentFolderProvider>
            <ConfirmProvider>
              <DashboardAppearanceProvider>
                <LayoutSettingsProvider>
                  <PersonalTeamWorkspaceProvider teamOwnerUid={teamOwnerUid}>
                    <Suspense fallback={null}>
                      <CheckoutSuccessSync />
                    </Suspense>
                    <DashboardShell>{children}</DashboardShell>
                  </PersonalTeamWorkspaceProvider>
                </LayoutSettingsProvider>
              </DashboardAppearanceProvider>
            </ConfirmProvider>
          </CurrentFolderProvider>
        </BackupProvider>
      </SubscriptionProvider>
    </EnterpriseProvider>
  );
}
