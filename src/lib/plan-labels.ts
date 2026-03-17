/**
 * Human-readable labels for plan IDs. Client-safe.
 */
export function getPlanLabel(planId: string | null): string {
  if (!planId) return "Starter Free";
  const labels: Record<string, string> = {
    free: "Starter Free",
    solo: "Bizzi Creator",
    indie: "Bizzi Pro",
    video: "Bizzi Network",
    production: "Enterprise Creative",
    enterprise: "Enterprise",
  };
  return labels[planId.toLowerCase()] ?? planId;
}
