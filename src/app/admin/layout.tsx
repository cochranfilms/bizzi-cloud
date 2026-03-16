"use client";

import { ThemeProvider } from "@/context/ThemeContext";
import { AdminDisplayProvider } from "@/context/AdminDisplayContext";
import AdminAuthGuard from "@/components/admin/AdminAuthGuard";
import AdminAppLayout from "@/admin/components/layout/AdminAppLayout";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <AdminAuthGuard>
        <AdminDisplayProvider>
            <AdminAppLayout
            systemStatus="healthy"
            lastSync={new Date()}
            unreadAlerts={0}
          >
            {children}
          </AdminAppLayout>
        </AdminDisplayProvider>
      </AdminAuthGuard>
    </ThemeProvider>
  );
}
