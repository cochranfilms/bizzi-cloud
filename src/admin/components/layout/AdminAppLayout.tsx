"use client";

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
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-100 dark:bg-neutral-950">
      <AdminSidebar systemStatus={systemStatus} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          lastSync={lastSync}
          onRefresh={onRefresh}
          unreadAlerts={unreadAlerts}
        />
        <AdminContentArea>{children}</AdminContentArea>
      </div>
    </div>
  );
}
