/**
 * User-facing performance preferences (not infrastructure assignment).
 * Labels educate; v1 stores preference only.
 */
export type WorkspacePerformanceRegion = {
  id: string;
  label: string;
  description: string;
};

export const WORKSPACE_PERFORMANCE_REGIONS: WorkspacePerformanceRegion[] = [
  {
    id: "us-west",
    label: "Americas — West",
    description: "Closest edge for uploads and playback if you work from the western US or similar time zones.",
  },
  {
    id: "us-east",
    label: "Americas — East",
    description: "Best starting point for eastern US, Canada, and Latin America–heavy workflows.",
  },
  {
    id: "eu-west",
    label: "Europe",
    description: "Optimized routing for UK and mainland Europe.",
  },
  {
    id: "apac",
    label: "Asia–Pacific",
    description: "Preferred if your team is mainly in Asia, Australia, or Oceania.",
  },
];

const REGION_IDS = new Set(WORKSPACE_PERFORMANCE_REGIONS.map((r) => r.id));

export function isValidPreferredPerformanceRegion(id: string): boolean {
  return REGION_IDS.has(id);
}
