/**
 * Admin storage types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface StorageCategory {
  id: string;
  label: string;
  bytes: number;
  percent: number;
}

export interface StorageAccount {
  id: string;
  name: string;
  email: string;
  bytes: number;
  growthPercent: number;
  fileCount: number;
}
