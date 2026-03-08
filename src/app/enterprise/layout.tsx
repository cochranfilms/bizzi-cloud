import { ThemeProvider } from "@/context/ThemeContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
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
              <ConfirmProvider>
                <EnterpriseAuthGuard>
                  <EnterpriseShell>{children}</EnterpriseShell>
                </EnterpriseAuthGuard>
              </ConfirmProvider>
            </DashboardAuthGuard>
          </CurrentFolderProvider>
        </BackupProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
