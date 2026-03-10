/**
 * Admin users service.
 * TODO: Replace with real API: fetch('/api/admin/users', { ... })
 */

import type { AdminUser } from "@/admin/types/adminUsers.types";

export interface UsersFilters {
  search?: string;
  plan?: string;
  status?: string;
  minStorage?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export async function fetchAdminUsers(
  filters: UsersFilters = {},
  page = 1,
  limit = 25
): Promise<{ users: AdminUser[]; total: number }> {
  // TODO: Real API with server-side filtering/pagination
  await new Promise((r) => setTimeout(r, 400));

  const mockUsers: AdminUser[] = Array.from({ length: 50 }, (_, i) => ({
    id: `u${i + 1}`,
    email: `user${i + 1}@example.com`,
    displayName: i % 3 === 0 ? null : `User ${i + 1}`,
    plan: i % 5 === 0 ? "enterprise" : i % 3 === 0 ? "pro" : i % 2 === 0 ? "free" : "business",
    status: i % 7 === 0 ? "suspended" : i % 11 === 0 ? "trial" : "active",
    storageUsedBytes: (50 + Math.random() * 500) * 1024 * 1024 * 1024,
    lastActive: new Date(Date.now() - 86400000 * Math.floor(Math.random() * 90)).toISOString(),
    totalFiles: Math.floor(Math.random() * 50000),
    uploadsThisMonth: Math.floor(Math.random() * 500),
    revenueGenerated: i % 3 === 0 ? (100 + Math.random() * 400) : 0,
    supportFlags: i % 13 === 0 ? ["billing dispute"] : [],
    signupDate: new Date(Date.now() - 86400000 * (180 + Math.random() * 365)).toISOString(),
  }));

  const start = (page - 1) * limit;
  const users = mockUsers.slice(start, start + limit);
  return { users, total: mockUsers.length };
}
