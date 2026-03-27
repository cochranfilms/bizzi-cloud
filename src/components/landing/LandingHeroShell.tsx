import type { ReactNode } from "react";
import { LANDING_PAGE_GRADIENT } from "@/lib/landing-gradient";

/**
 * Rounded hero “shell” (gradient + corners). The landing header stays a sibling
 * in `page.tsx` so `position: sticky` spans the full page; this block uses
 * negative margin + matching padding to slide the shell under the header.
 */
export default function LandingHeroShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="landing-hero-shell-outer -mt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+4.75rem)] mb-3 px-2.5 pb-0 pt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+4.75rem)] sm:-mt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+5rem)] sm:mb-5 sm:pt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+5rem)] sm:px-4 md:px-6 lg:px-10"
    >
      <div
        className="landing-hero-shell-surface relative rounded-t-[2.875rem] rounded-b-[2.875rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.35)] sm:rounded-t-[3.375rem] sm:rounded-b-[3.375rem] md:rounded-t-[4rem] md:rounded-b-[4rem] lg:rounded-t-[4.75rem] lg:rounded-b-[4.75rem]"
        style={{ background: LANDING_PAGE_GRADIENT }}
      >
        {children}
      </div>
    </div>
  );
}
