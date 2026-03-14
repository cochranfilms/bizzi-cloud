import { Suspense } from "react";
import { ThemeProvider } from "@/context/ThemeContext";
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
                  <Suspense fallback={null}>
                    <CheckoutSuccessSync />
                  </Suspense>
                  <DesktopShell>{children}</DesktopShell>
                </ConfirmProvider>
              </SubscriptionProvider>
            </DesktopAuthGuard>
          </CurrentFolderProvider>
        </BackupProvider>
      </EnterpriseProvider>
    </ThemeProvider>
  );
}
