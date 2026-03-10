/**
 * Admin alerts service.
 * TODO: Replace with real API calls.
 */

import type { AdminAlert } from "@/admin/types/adminAlerts.types";

export async function fetchAlerts(filters?: {
  severity?: string;
  limit?: number;
}): Promise<AdminAlert[]> {
  await new Promise((r) => setTimeout(r, 300));
  const alerts: AdminAlert[] = [
    {
      id: "a1",
      severity: "warning",
      title: "Queue backlog increased",
      source: "Queue",
      timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
      suggestedCause: "Worker capacity",
      recommendedAction: "Scale workers",
    },
    {
      id: "a2",
      severity: "warning",
      title: "Failed uploads spike",
      source: "Upload pipeline",
      timestamp: new Date(Date.now() - 45 * 60000).toISOString(),
      targetUserId: "u3",
    },
    {
      id: "a3",
      severity: "info",
      title: "High storage growth - John Doe",
      source: "Storage",
      timestamp: new Date(Date.now() - 2 * 3600000).toISOString(),
      targetUserId: "u5",
    },
    {
      id: "a4",
      severity: "warning",
      title: "Failed payment - Creative Co",
      source: "Payments",
      timestamp: new Date(Date.now() - 4 * 3600000).toISOString(),
      targetUserId: "u2",
    },
  ];
  return alerts;
}
