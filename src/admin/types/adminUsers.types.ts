/**
 * Admin users types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  plan: string;
  status: "active" | "suspended" | "trial" | "churned";
  storageUsedBytes: number;
  lastActive: string | null;
  totalFiles: number;
  uploadsThisMonth: number;
  revenueGenerated: number;
  supportFlags: string[];
  signupDate: string;
  company?: string;
  region?: string;
}
