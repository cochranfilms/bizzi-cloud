/**
 * Admin overview types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface PlatformHealthCheck {
  id: string;
  name: string;
  status: "healthy" | "warning" | "critical";
  lastCheck: string;
  latencyMs?: number;
}

export interface CriticalAlert {
  id: string;
  severity: "critical" | "warning";
  title: string;
  source: string;
  timestamp: string;
  recommendedAction?: string;
}

export interface TopAccount {
  id: string;
  name: string;
  email: string;
  plan: string;
  storageUsedBytes: number;
  revenueMonth: number;
  lastActive: string | null;
}

export interface OverviewMetrics {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersMonth: number;
  newSignups: number | null;
  churnedUsers: number | null;
  totalStorageBytes: number;
  totalStorageAvailableBytes: number | null;
  avgStoragePerUserBytes: number;
  uploadsToday: number;
  downloadTrafficBytesToday: number | null;
  mrr: number;
  estimatedInfraCost: number | null;
  grossMarginPercent: number | null;
  supportTicketsOpen: number;
  criticalAlertsCount: number;
  lastSyncTimestamp: string;
}
