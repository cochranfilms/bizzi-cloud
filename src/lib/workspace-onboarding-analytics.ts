/**
 * Workspace onboarding funnel — extend with HubSpot / dataLayer when product analytics ships.
 */
export type WorkspaceOnboardingAnalyticsEvent =
  | "wizard_started"
  | "step_viewed"
  | "step_completed"
  | "wizard_completed"
  | "wizard_abandoned";

export function logWorkspaceOnboardingEvent(
  event: WorkspaceOnboardingAnalyticsEvent,
  detail?: Record<string, unknown>
): void {
  if (typeof window !== "undefined" && window.dispatchEvent) {
    try {
      window.dispatchEvent(
        new CustomEvent("bizzi:workspace-onboarding", {
          detail: { event, ...detail },
        })
      );
    } catch {
      /* ignore */
    }
  }
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- intentional dev signal
    console.debug(`[workspace-onboarding] ${event}`, detail ?? {});
  }
}
