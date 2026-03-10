/**
 * Admin storage service.
 * TODO: Replace with real API calls.
 */

import type { StorageCategory, StorageAccount } from "@/admin/types/adminStorage.types";

export async function fetchStorageSummary() {
  await new Promise((r) => setTimeout(r, 300));
  return {
    totalBytes: 12.4 * 1024 * 1024 * 1024 * 1024,
    quotaBytes: 50 * 1024 * 1024 * 1024 * 1024,
    byCategory: [
      { id: "videos", label: "Videos", bytes: 6.2e12, percent: 50 },
      { id: "photos", label: "Photos", bytes: 3.1e12, percent: 25 },
      { id: "raw_photos", label: "RAW", bytes: 1.5e12, percent: 12 },
      { id: "documents", label: "Documents", bytes: 8e11, percent: 6.5 },
      { id: "projects", label: "Projects", bytes: 6e11, percent: 5 },
      { id: "other", label: "Other", bytes: 1e12, percent: 8 },
    ] as StorageCategory[],
  };
}

export async function fetchLargestAccounts(limit = 10): Promise<StorageAccount[]> {
  await new Promise((r) => setTimeout(r, 300));
  return [
    { id: "u1", name: "Acme Studios", email: "admin@acme.com", bytes: 2.1e12, growthPercent: 12, fileCount: 45000 },
    { id: "u2", name: "Creative Co", email: "billing@creative.co", bytes: 1.8e12, growthPercent: 8, fileCount: 32000 },
    { id: "u3", name: "Film House", email: "ops@filmhouse.pro", bytes: 1.5e12, growthPercent: 22, fileCount: 28000 },
    { id: "u4", name: "Jane Smith", email: "jane@example.com", bytes: 450e9, growthPercent: 5, fileCount: 12000 },
    { id: "u5", name: "John Doe", email: "john@test.com", bytes: 320e9, growthPercent: -2, fileCount: 8000 },
  ];
}
