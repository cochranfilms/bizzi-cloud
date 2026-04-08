"use client";

import { useEffect } from "react";
import { CircleCheck, Sparkles } from "lucide-react";

export type WorkspaceOnboardingCelebrationVariant =
  | "mandatory_complete"
  | "review_saved"
  | "settings_entry";

type Props = {
  open: boolean;
  variant: WorkspaceOnboardingCelebrationVariant;
  workspaceName?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
};

const COPY: Record<
  WorkspaceOnboardingCelebrationVariant,
  { title: string; subtitle: string; primary: string; secondary?: string }
> = {
  mandatory_complete: {
    title: "You’ve successfully completed onboarding",
    subtitle:
      "Your workspace is tailored to how you work. Jump in whenever you’re ready — you can update these details anytime in Settings.",
    primary: "Go to dashboard",
  },
  review_saved: {
    title: "Workspace preferences updated",
    subtitle:
      "Your changes are saved. They’ll sync across the app and in your admin record for support.",
    primary: "Done",
  },
  settings_entry: {
    title: "Workspace setup complete",
    subtitle:
      "You’ve already finished onboarding. Update your workspace name, how you work, or your preferred performance region whenever you like.",
    primary: "Edit workspace details",
    secondary: "Back to Settings",
  },
};

export default function WorkspaceOnboardingCelebrationModal({
  open,
  variant,
  workspaceName,
  onPrimary,
  onSecondary,
}: Props) {
  const copy = COPY[variant];

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-neutral-950/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wo-celebration-title"
      aria-describedby="wo-celebration-desc"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-white via-white to-neutral-50 shadow-2xl dark:border-neutral-600 dark:from-neutral-900 dark:via-neutral-900 dark:to-neutral-950">
        <div
          className="h-1.5 w-full bg-gradient-to-r from-bizzi-blue via-cyan-400 to-emerald-400"
          aria-hidden
        />

        <div className="px-6 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-6">
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="relative mb-4 flex h-16 w-16 items-center justify-center">
              <div
                className="absolute inset-0 rounded-2xl bg-gradient-to-br from-bizzi-blue/25 to-emerald-400/20 blur-md"
                aria-hidden
              />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-200/50 bg-gradient-to-br from-cyan-50 to-white shadow-lg dark:border-cyan-500/20 dark:from-cyan-950/50 dark:to-neutral-900">
                {variant === "settings_entry" ? (
                  <Sparkles className="h-8 w-8 text-cyan-600 dark:text-cyan-400" strokeWidth={1.75} />
                ) : (
                  <CircleCheck className="h-8 w-8 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} />
                )}
              </div>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
              Bizzi Cloud
            </p>
            <h2
              id="wo-celebration-title"
              className="mt-2 text-xl font-bold tracking-tight text-neutral-900 dark:text-white sm:text-2xl"
            >
              {copy.title}
            </h2>
            <p
              id="wo-celebration-desc"
              className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400"
            >
              {copy.subtitle}
            </p>
            {workspaceName?.trim() ? (
              <p className="mt-4 w-full rounded-xl border border-neutral-200/80 bg-neutral-50/90 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:border-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-100">
                <span className="text-neutral-500 dark:text-neutral-400">Workspace </span>
                {workspaceName.trim()}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            <button
              type="button"
              onClick={onPrimary}
              className="w-full rounded-xl bg-bizzi-blue px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/30 transition hover:bg-bizzi-cyan sm:min-w-[200px] sm:flex-1"
            >
              {copy.primary}
            </button>
            {copy.secondary && onSecondary ? (
              <button
                type="button"
                onClick={onSecondary}
                className="w-full rounded-xl border border-neutral-200 bg-white px-5 py-3.5 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 sm:flex-1"
              >
                {copy.secondary}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
