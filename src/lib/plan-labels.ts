/**
 * Human-readable labels for plan IDs. Client-safe.
 */
export function getPlanLabel(planId: string | null): string {
  if (!planId) return "Starter Free";
  const labels: Record<string, string> = {
    free: "Starter Free",
    solo: "Solo Creator",
    indie: "Indie Filmmaker",
    video: "Video Pro",
    production: "Production House",
    enterprise: "Enterprise",
  };
  return labels[planId.toLowerCase()] ?? planId;
}
