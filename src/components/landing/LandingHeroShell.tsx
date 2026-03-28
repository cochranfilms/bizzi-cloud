import type { ReactNode } from "react";

/**
 * Rounded hero “shell” (gradient + corners). The landing header stays a sibling
 * in `page.tsx` so `position: sticky` spans the full page; this block uses
 * negative margin + matching padding to slide the shell under the header.
 * Gradient comes from `.landing-hero-shell-surface` in `globals.css` (light/dark).
 */
export default function LandingHeroShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="landing-hero-shell-outer -mt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+4.75rem)] mb-3 px-2.5 pb-0 pt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+4.75rem)] sm:-mt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+5rem)] sm:mb-5 sm:pt-[calc(max(0.5rem,env(safe-area-inset-top,0px))+5rem)] sm:px-4 md:px-6 lg:px-10"
    >
      <div
        className="landing-hero-shell-surface relative rounded-t-[3.25rem] rounded-b-[3.25rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(255,255,255,0.35)] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-1px_0_rgba(0,0,0,0.35)] sm:rounded-t-[3.75rem] sm:rounded-b-[3.75rem] md:rounded-t-[4.25rem] md:rounded-b-[4.25rem] lg:rounded-t-[5rem] lg:rounded-b-[5rem] xl:rounded-t-[5.5rem] xl:rounded-b-[5.5rem]"
      >
        {children}
      </div>
    </div>
  );
}
