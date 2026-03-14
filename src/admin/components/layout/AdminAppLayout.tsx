"use client";

import { useState } from "react";
import AdminSidebar from "./AdminSidebar";
import AdminTopbar from "./AdminTopbar";
import AdminContentArea from "./AdminContentArea";

interface AdminAppLayoutProps {
  children: React.ReactNode;
  /** System status for sidebar indicator */
  systemStatus?: "healthy" | "warning" | "critical";
  /** Last sync timestamp for topbar */
  lastSync?: Date | string | null;
  /** Refresh handler for topbar */
  onRefresh?: () => void;
  /** Unread alerts count for topbar bell */
  unreadAlerts?: number;
}

export default function AdminAppLayout({
  children,
  systemStatus = "healthy",
  lastSync,
  onRefresh,
  unreadAlerts = 0,
}: AdminAppLayoutProps) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <AdminSidebar
        systemStatus={systemStatus}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          lastSync={lastSync}
          onRefresh={onRefresh}
          unreadAlerts={unreadAlerts}
          onMenuClick={() => setMobileSidebarOpen(true)}
        />
        <AdminContentArea>{children}</AdminContentArea>
      </div>
    </div>
  );
}
