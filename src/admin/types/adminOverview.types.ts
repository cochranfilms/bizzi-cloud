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
  riskScore?: number;
  lastActive: string;
}

export interface OverviewMetrics {
  totalUsers: number;
  activeUsersToday: number;
  activeUsersMonth: number;
  newSignups: number;
  churnedUsers: number;
  totalStorageBytes: number;
  totalStorageAvailableBytes: number | null;
  avgStoragePerUserBytes: number;
  uploadsToday: number;
  downloadTrafficBytesToday: number;
  mrr: number;
  estimatedInfraCost: number;
  grossMarginPercent: number;
  supportTicketsOpen: number;
  criticalAlertsCount: number;
  lastSyncTimestamp: string;
}
