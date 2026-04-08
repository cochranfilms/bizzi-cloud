import { Suspense } from "react";
import { EnterpriseProvider } from "@/context/EnterpriseContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <EnterpriseProvider>
      <SubscriptionProvider>
        <DashboardAuthGuard>
          <Suspense fallback={null}>{children}</Suspense>
        </DashboardAuthGuard>
      </SubscriptionProvider>
    </EnterpriseProvider>
  );
}
