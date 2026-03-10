/**
 * Admin upload/transfer analytics types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface UploadMetrics {
  countToday: number;
  successRate: number;
  avgSpeedMbps: number;
  failedCount: number;
  retryRate: number;
}

export interface UploadVolumePoint {
  date: string;
  count: number;
  successCount: number;
  failedCount: number;
}

export interface UploadFailureReason {
  reason: string;
  count: number;
}
