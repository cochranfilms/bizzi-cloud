import { Suspense } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { DashboardAppearanceProvider } from "@/context/DashboardAppearanceContext";
import { LayoutSettingsProvider } from "@/context/LayoutSettingsContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";
import CheckoutSuccessSync from "@/components/dashboard/CheckoutSuccessSync";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <EnterpriseProvider>
        <SubscriptionProvider>
          <BackupProvider>
            <CurrentFolderProvider>
              <DashboardAuthGuard>
                <ConfirmProvider>
                  <DashboardAppearanceProvider>
                    <LayoutSettingsProvider>
                      <Suspense fallback={null}>
                        <CheckoutSuccessSync />
                      </Suspense>
                      <DashboardShell>{children}</DashboardShell>
                    </LayoutSettingsProvider>
                  </DashboardAppearanceProvider>
                </ConfirmProvider>
            </DashboardAuthGuard>
          </CurrentFolderProvider>
          </BackupProvider>
        </SubscriptionProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
