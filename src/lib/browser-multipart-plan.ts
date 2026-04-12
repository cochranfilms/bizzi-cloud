/**
 * Pure browser upload part sizing (no AWS/Node). Shared by `b2`/API and client telemetry.
 */

import { BROWSER_MULTIPART_CONCURRENCY } from "@/lib/multipart-thresholds";

const B2_PART_MIN = 5 * 1024 * 1024;
const B2_PART_MAX = 5 * 1024 * 1024 * 1024;
const B2_MAX_PARTS = 10000;

export interface BrowserMultipartPartPlan {
  partSize: number;
  totalParts: number;
  recommendedConcurrency: number;
}

export function computeBrowserMultipartPartPlan(fileSizeBytes: number): BrowserMultipartPartPlan {
  if (fileSizeBytes === 0) {
    return {
      partSize: 8 * 1024 * 1024,
      totalParts: 1,
      recommendedConcurrency: 1,
    };
  }
  const twoGiB = 2 * 1024 * 1024 * 1024;
  let partSize = fileSizeBytes > twoGiB ? 64 * 1024 * 1024 : 32 * 1024 * 1024;
  let totalParts = Math.ceil(fileSizeBytes / partSize);
  if (totalParts > B2_MAX_PARTS) {
    partSize = Math.ceil(fileSizeBytes / B2_MAX_PARTS);
    partSize = Math.max(B2_PART_MIN, Math.min(partSize, B2_PART_MAX));
    totalParts = Math.ceil(fileSizeBytes / partSize);
  }
  return {
    partSize,
    totalParts,
    recommendedConcurrency: BROWSER_MULTIPART_CONCURRENCY,
  };
}
