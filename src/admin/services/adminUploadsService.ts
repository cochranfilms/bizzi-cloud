/**
 * Admin upload analytics service.
 * TODO: Replace with real API calls.
 */

import type {
  UploadMetrics,
  UploadVolumePoint,
  UploadFailureReason,
} from "@/admin/types/adminUploads.types";

export async function fetchUploadMetrics(): Promise<UploadMetrics> {
  await new Promise((r) => setTimeout(r, 300));
  return {
    countToday: 4521,
    successRate: 97.2,
    avgSpeedMbps: 42,
    failedCount: 126,
    retryRate: 4.1,
  };
}

export async function fetchUploadVolume(days = 14): Promise<UploadVolumePoint[]> {
  await new Promise((r) => setTimeout(r, 250));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const base = 3000 + Math.random() * 2000;
    const fail = Math.floor(base * 0.03);
    return {
      date: d.toISOString().slice(0, 10),
      count: Math.floor(base),
      successCount: Math.floor(base - fail),
      failedCount: fail,
    };
  });
}

export async function fetchUploadFailures(): Promise<UploadFailureReason[]> {
  await new Promise((r) => setTimeout(r, 200));
  return [
    { reason: "Network timeout", count: 48 },
    { reason: "Invalid file type", count: 32 },
    { reason: "Size limit exceeded", count: 24 },
    { reason: "Storage quota full", count: 12 },
    { reason: "Other", count: 10 },
  ];
}
