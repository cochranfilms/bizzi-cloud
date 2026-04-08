/**
 * Admin users types.
 * TODO: Align with real Bizzi Cloud API responses.
 */

/** Workspace onboarding answers from `profiles` (wizard + review). */
export interface AdminWorkspaceOnboardingSnapshot {
  status: "pending" | "completed" | null;
  version: number | null;
  completedAt: string | null;
  workspaceDisplayName: string | null;
  collaborationMode: string | null;
  teamType: string | null;
  useCase: string | null;
  preferredPerformanceRegion: string | null;
}

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
  workspaceOnboarding?: AdminWorkspaceOnboardingSnapshot | null;
}
