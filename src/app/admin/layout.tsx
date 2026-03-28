"use client";

import { AdminDisplayProvider } from "@/context/AdminDisplayContext";
import AdminAuthGuard from "@/components/admin/AdminAuthGuard";
import AdminAppLayout from "@/admin/components/layout/AdminAppLayout";
import { useAdminAlertCount } from "@/admin/hooks/useAdminAlertCount";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { count } = useAdminAlertCount();

  return (
    <AdminAuthGuard>
      <AdminDisplayProvider>
        <AdminAppLayout
          systemStatus="healthy"
          lastSync={new Date()}
          unreadAlerts={count}
        >
          {children}
        </AdminAppLayout>
      </AdminDisplayProvider>
    </AdminAuthGuard>
  );
}
