/**
 * Map plan IDs to display labels for admin dashboard.
 */
export function mapPlanToLabel(planId: string | null): string {
  if (!planId) return "Free";
  const labels: Record<string, string> = {
    free: "Free",
    solo: "Solo Creator",
    indie: "Indie Filmmaker",
    video: "Video Pro",
    production: "Production House",
    starter: "Starter",
    pro: "Pro",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
  };
  return labels[planId.toLowerCase()] ?? planId;
}
