import { ThemeProvider } from "@/context/ThemeContext";
import { DashboardAppearanceProvider } from "@/context/DashboardAppearanceContext";
import { LayoutSettingsProvider } from "@/context/LayoutSettingsContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";
import EnterpriseAuthGuard from "@/components/enterprise/EnterpriseAuthGuard";
import EnterpriseShell from "@/components/enterprise/EnterpriseShell";

export default function EnterpriseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <EnterpriseProvider>
        <BackupProvider>
          <CurrentFolderProvider>
            <DashboardAuthGuard>
              <SubscriptionProvider>
                <ConfirmProvider>
                  <DashboardAppearanceProvider>
                    <LayoutSettingsProvider>
                      <EnterpriseAuthGuard>
                        <EnterpriseShell>{children}</EnterpriseShell>
                      </EnterpriseAuthGuard>
                    </LayoutSettingsProvider>
                  </DashboardAppearanceProvider>
                </ConfirmProvider>
              </SubscriptionProvider>
            </DashboardAuthGuard>
          </CurrentFolderProvider>
        </BackupProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
