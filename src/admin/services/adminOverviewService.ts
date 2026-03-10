/**
 * Admin overview service.
 * TODO: Replace mock data with real API calls to Bizzi Cloud backend.
 * Example: fetch('/api/admin/overview', { headers: { Authorization: `Bearer ${token}` } })
 */

import type {
  OverviewMetrics,
  PlatformHealthCheck,
  CriticalAlert,
  TopAccount,
} from "@/admin/types/adminOverview.types";

export async function fetchOverviewMetrics(): Promise<OverviewMetrics> {
  // TODO: const res = await fetch('/api/admin/overview/metrics');
  await new Promise((r) => setTimeout(r, 300));
  return {
    totalUsers: 1247,
    activeUsersToday: 342,
    activeUsersMonth: 892,
    newSignups: 28,
    churnedUsers: 5,
    totalStorageBytes: 12.4 * 1024 * 1024 * 1024 * 1024, // ~12.4 TB
    totalStorageAvailableBytes: 50 * 1024 * 1024 * 1024 * 1024, // 50 TB
    avgStoragePerUserBytes: 10.2 * 1024 * 1024 * 1024, // ~10.2 GB
    uploadsToday: 4521,
    downloadTrafficBytesToday: 890 * 1024 * 1024 * 1024, // ~890 GB
    mrr: 42800,
    estimatedInfraCost: 12400,
    grossMarginPercent: 71,
    supportTicketsOpen: 12,
    criticalAlertsCount: 1,
    lastSyncTimestamp: new Date().toISOString(),
  };
}

export async function fetchPlatformHealth(): Promise<PlatformHealthCheck[]> {
  // TODO: fetch('/api/admin/health')
  await new Promise((r) => setTimeout(r, 200));
  return [
    { id: "api", name: "API", status: "healthy", lastCheck: new Date().toISOString(), latencyMs: 45 },
    { id: "uploads", name: "Upload pipeline", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "downloads", name: "Download pipeline", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "jobs", name: "Background jobs", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "database", name: "Database", status: "healthy", lastCheck: new Date().toISOString(), latencyMs: 12 },
    { id: "cache", name: "Cache", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "queue", name: "Queue", status: "warning", lastCheck: new Date().toISOString() },
    { id: "cdn", name: "CDN", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "storage", name: "Object storage", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "auth", name: "Authentication", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "payments", name: "Payment system", status: "healthy", lastCheck: new Date().toISOString() },
    { id: "email", name: "Email system", status: "healthy", lastCheck: new Date().toISOString() },
  ];
}

export async function fetchCriticalAlerts(): Promise<CriticalAlert[]> {
  // TODO: fetch('/api/admin/alerts?severity=critical,warning&limit=5')
  await new Promise((r) => setTimeout(r, 150));
  return [
    {
      id: "1",
      severity: "warning",
      title: "Queue backlog increased",
      source: "Queue",
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      recommendedAction: "Check worker capacity and scale if needed",
    },
    {
      id: "2",
      severity: "warning",
      title: "Failed uploads spike (last hour)",
      source: "Upload pipeline",
      timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      recommendedAction: "Review upload logs for pattern",
    },
  ];
}

export async function fetchTopAccounts(): Promise<TopAccount[]> {
  // TODO: fetch('/api/admin/accounts/top?by=storage,revenue,risk&limit=10')
  await new Promise((r) => setTimeout(r, 250));
  return [
    {
      id: "u1",
      name: "Acme Studios",
      email: "admin@acmestudios.com",
      plan: "enterprise",
      storageUsedBytes: 2.1 * 1024 * 1024 * 1024 * 1024,
      revenueMonth: 4500,
      riskScore: 5,
      lastActive: new Date().toISOString(),
    },
    {
      id: "u2",
      name: "Creative Co",
      email: "billing@creativeco.io",
      plan: "business",
      storageUsedBytes: 1.8 * 1024 * 1024 * 1024 * 1024,
      revenueMonth: 1200,
      riskScore: 12,
      lastActive: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "u3",
      name: "Jane Smith",
      email: "jane@example.com",
      plan: "pro",
      storageUsedBytes: 450 * 1024 * 1024 * 1024,
      revenueMonth: 29,
      riskScore: 85,
      lastActive: new Date(Date.now() - 86400000 * 14).toISOString(),
    },
    {
      id: "u4",
      name: "Film House Pro",
      email: "ops@filmhouse.pro",
      plan: "enterprise",
      storageUsedBytes: 3.2 * 1024 * 1024 * 1024 * 1024,
      revenueMonth: 8900,
      riskScore: 8,
      lastActive: new Date().toISOString(),
    },
    {
      id: "u5",
      name: "John Doe",
      email: "john@test.com",
      plan: "free",
      storageUsedBytes: 85 * 1024 * 1024 * 1024,
      revenueMonth: 0,
      riskScore: 92,
      lastActive: new Date(Date.now() - 86400000 * 90).toISOString(),
    },
  ];
}
