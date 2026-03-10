/**
 * Admin files service.
 * TODO: Replace with real API: fetch('/api/admin/files', { ... })
 */

import type { AdminFile } from "@/admin/types/adminFiles.types";

export interface FilesFilters {
  search?: string;
  ownerId?: string;
  status?: string;
  extension?: string;
}

export async function fetchAdminFiles(
  filters: FilesFilters = {},
  page = 1,
  limit = 25
): Promise<{ files: AdminFile[]; total: number }> {
  await new Promise((r) => setTimeout(r, 400));

  const extensions = ["mp4", "mov", "jpg", "png", "psd", "pdf", "arw"];
  const mockFiles: AdminFile[] = Array.from({ length: 60 }, (_, i) => ({
    id: `f${i + 1}`,
    name: `file_${i + 1}.${extensions[i % extensions.length]}`,
    ownerId: `u${(i % 10) + 1}`,
    ownerEmail: `user${(i % 10) + 1}@example.com`,
    sizeBytes: (1 + Math.random() * 500) * 1024 * 1024,
    mimeType: `application/${extensions[i % extensions.length]}`,
    extension: extensions[i % extensions.length],
    folderPath: `/projects/${i % 3}`,
    status: i % 20 === 0 ? "archived" : i % 30 === 0 ? "trash" : "active",
    shared: i % 5 === 0,
    createdAt: new Date(Date.now() - 86400000 * (30 + i)).toISOString(),
    modifiedAt: new Date(Date.now() - 86400000 * (i % 30)).toISOString(),
    flags: i % 15 === 0 ? ["investigate"] : undefined,
  }));

  const start = (page - 1) * limit;
  return { files: mockFiles.slice(start, start + limit), total: mockFiles.length };
}

export async function fetchLargeFiles(limit = 10): Promise<AdminFile[]> {
  await new Promise((r) => setTimeout(r, 200));
  const { files } = await fetchAdminFiles({}, 1, 100);
  return files
    .filter((f) => f.sizeBytes > 500 * 1024 * 1024)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, limit);
}
