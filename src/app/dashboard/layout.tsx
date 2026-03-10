import { Suspense } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { ConfirmProvider } from "@/context/ConfirmContext";
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
        <BackupProvider>
          <CurrentFolderProvider>
            <DashboardAuthGuard>
              <ConfirmProvider>
                <Suspense fallback={null}>
                  <CheckoutSuccessSync />
                </Suspense>
                <DashboardShell>{children}</DashboardShell>
              </ConfirmProvider>
            </DashboardAuthGuard>
          </CurrentFolderProvider>
        </BackupProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
