/**
 * Canonical plan gates for personal team shell, seats, and related UX.
 * Do not duplicate hardcoded plan sets elsewhere.
 */
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";

/**
 * Whether this plan may materialize `personal_teams/{uid}` on explicit intent (`POST …/ensure-shell`, etc.).
 *
 * **Product:** Same boundary as {@link planAllowsPersonalTeamSeats} / `storageTiers[].allowsSeats`
 * (Bizzi Pro, Network, We Bizzi — not Free or Bizzi Creator). The team shell is a workspace for plans
 * that can sell team seats; “teaser” for seat purchase happens *inside* those plans (setup mode), not by
 * giving every paid tier a shell doc. To widen or narrow, change `allowsSeats` on tiers (or this helper),
 * not scattered route checks.
 */
export function mayInitiatePersonalTeamShell(planId: string): boolean {
  const id = (planId ?? "").trim() || "free";
  return id !== "free" && planAllowsPersonalTeamSeats(id);
}

/** Same product boundary as seat purchase / invites (alias for clarity at call sites). */
export function mayPurchaseTeamSeats(planId: string): boolean {
  return mayInitiatePersonalTeamShell(planId);
}

/** Team branding onboarding applies on team-capable paid plans with a shell row (see /api/profile owns_personal_team). */
export function mayShowPersonalTeamBrandingOnboarding(planId: string, ownsPersonalTeam: boolean): boolean {
  return ownsPersonalTeam && mayInitiatePersonalTeamShell(planId);
}
