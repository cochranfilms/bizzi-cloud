import { Suspense } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { DashboardAppearanceProvider } from "@/context/DashboardAppearanceContext";
import { LayoutSettingsProvider } from "@/context/LayoutSettingsContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import DesktopShell from "@/components/desktop/DesktopShell";
import DesktopAuthGuard from "@/components/desktop/DesktopAuthGuard";
import CheckoutSuccessSync from "@/components/dashboard/CheckoutSuccessSync";

export default function DesktopAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <EnterpriseProvider>
        <BackupProvider>
          <CurrentFolderProvider>
            <DesktopAuthGuard>
              <SubscriptionProvider>
                <ConfirmProvider>
                  <DashboardAppearanceProvider>
                    <LayoutSettingsProvider>
                      <Suspense fallback={null}>
                        <CheckoutSuccessSync />
                      </Suspense>
                      <DesktopShell>{children}</DesktopShell>
                    </LayoutSettingsProvider>
                  </DashboardAppearanceProvider>
                </ConfirmProvider>
              </SubscriptionProvider>
            </DesktopAuthGuard>
          </CurrentFolderProvider>
        </BackupProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
