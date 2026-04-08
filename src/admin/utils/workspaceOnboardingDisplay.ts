import { WORKSPACE_PERFORMANCE_REGIONS } from "@/lib/workspace-regions";
import type { TeamType, UseCase } from "@/lib/workspace-onboarding";
import { isValidTeamType, isValidUseCase, isValidCollaborationMode } from "@/lib/workspace-onboarding";

const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  creator: "Creator / independent",
  production_company: "Production company",
  post_house: "Post house / facility",
  brand_inhouse: "Brand / in-house",
  other: "Other",
};

const USE_CASE_LABELS: Record<UseCase, string> = {
  dailies: "Dailies & review",
  finishing: "Finishing & delivery",
  archive: "Archive & long-term storage",
  delivery: "Client delivery",
  general: "General media workflows",
};

export function formatCollaborationMode(slug: string | null | undefined): string {
  if (!slug) return "—";
  return isValidCollaborationMode(slug)
    ? slug === "solo"
      ? "Mostly solo"
      : "Works with collaborators"
    : slug;
}

export function formatTeamType(slug: string | null | undefined): string {
  if (!slug) return "—";
  return isValidTeamType(slug) ? TEAM_TYPE_LABELS[slug] : slug;
}

export function formatUseCase(slug: string | null | undefined): string {
  if (!slug) return "—";
  return isValidUseCase(slug) ? USE_CASE_LABELS[slug] : slug;
}

export function formatPerformanceRegion(slug: string | null | undefined): string {
  if (!slug) return "—";
  const r = WORKSPACE_PERFORMANCE_REGIONS.find((x) => x.id === slug);
  return r ? r.label : slug;
}

export function adminWorkspaceOnboardingHasContent(args: {
  status: string | null;
  workspaceDisplayName: string | null;
  collaborationMode: string | null;
  teamType: string | null;
  useCase: string | null;
  region: string | null;
}): boolean {
  return (
    args.status != null ||
    (args.workspaceDisplayName?.trim().length ?? 0) > 0 ||
    !!args.collaborationMode ||
    !!args.teamType ||
    !!args.useCase ||
    !!args.region
  );
}
