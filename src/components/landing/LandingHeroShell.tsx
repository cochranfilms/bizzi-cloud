import type { ReactNode } from "react";
import { LANDING_PAGE_GRADIENT } from "@/lib/landing-gradient";

/**
 * Wraps the landing header + hero so the top reads as one rounded “shell”
 * (large outer corners + centered sculpted nav flush with the shell top).
 */
export default function LandingHeroShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing-hero-shell-outer px-2.5 pt-[max(0.5rem,env(safe-area-inset-top))] pb-0 sm:px-4 md:px-6 lg:px-10">
      <div
        className="landing-hero-shell-surface relative rounded-t-[2.875rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] sm:rounded-t-[3.375rem] md:rounded-t-[4rem] lg:rounded-t-[4.75rem]"
        style={{ background: LANDING_PAGE_GRADIENT }}
      >
        {children}
      </div>
    </div>
  );
}
