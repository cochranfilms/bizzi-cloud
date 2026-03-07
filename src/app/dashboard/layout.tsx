import { ThemeProvider } from "@/context/ThemeContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <BackupProvider>
        <CurrentFolderProvider>
          <DashboardAuthGuard>
            <EnterpriseProvider>
              <ConfirmProvider>
                <DashboardShell>{children}</DashboardShell>
              </ConfirmProvider>
            </EnterpriseProvider>
          </DashboardAuthGuard>
        </CurrentFolderProvider>
      </BackupProvider>
    </ThemeProvider>
  );
}
