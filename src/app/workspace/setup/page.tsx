"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import BizziLogoMark from "@/components/BizziLogoMark";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { WORKSPACE_PERFORMANCE_REGIONS } from "@/lib/workspace-regions";
import {
  TEAM_TYPES,
  USE_CASES,
  type CollaborationMode,
  type TeamType,
  type UseCase,
} from "@/lib/workspace-onboarding";
import { logWorkspaceOnboardingEvent } from "@/lib/workspace-onboarding-analytics";
import { Loader2 } from "lucide-react";

const TEAM_TYPE_LABELS: Record<TeamType, string> = {
  creator: "Creator / independent",
  production_company: "Production company",
  post_house: "Post house / facility",
  brand_inhouse: "Brand / in-house",
  other: "Other",
};

const USE_CASE_LABELS: Record<UseCase, string> = {
  dailies: "Dailies & review",
  finishing: "Finishing & delivery",
  archive: "Archive & long-term storage",
  delivery: "Client delivery",
  general: "General media workflows",
};

function stepStorageKey(uid: string) {
  return `bizzi_wo_step_v1_${uid}`;
}

function normalizeWorkspaceNameInput(s: string) {
  return s.trim().slice(0, 120);
}

function WorkspaceSetupInner() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isReview = searchParams.get("review") === "1";
  const { refetch: refetchSubscription } = useSubscription();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<string | null>(null);

  const [workspaceName, setWorkspaceName] = useState("");
  /** team_name from personal_team_settings when present; used for read-only UX + naming clarity */
  const [teamWorkspaceNameFromSettings, setTeamWorkspaceNameFromSettings] = useState<string | null>(
    null
  );
  const [collaboration, setCollaboration] = useState<CollaborationMode | "">("");
  const [teamType, setTeamType] = useState<TeamType | "">("");
  const [useCase, setUseCase] = useState<UseCase | "">("");
  const [region, setRegion] = useState("");

  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const lastStepRef = useRef(-1);

  const persistStepLocal = useCallback(
    (s: number) => {
      if (!user?.uid || typeof window === "undefined") return;
      try {
        localStorage.setItem(stepStorageKey(user.uid), String(s));
      } catch {
        /* ignore */
      }
    },
    [user?.uid]
  );

  const patchDraft = useCallback(
    async (partial: Record<string, unknown>) => {
      if (!user) return;
      const token = await user.getIdToken();
      await fetch("/api/workspace-onboarding", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(partial),
      });
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const [profileRes, teamRes] = await Promise.all([
          fetch(`${base}/api/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(
            `${base}/api/personal-team/settings?owner_uid=${encodeURIComponent(user.uid)}`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
        ]);

        if (!profileRes.ok) throw new Error("Could not load profile");
        const profileJson = (await profileRes.json()) as {
          workspace_onboarding_status?: string | null;
          workspace_onboarding?: {
            collaboration_mode?: string;
            team_type?: string;
            use_case?: string;
            preferred_performance_region?: string;
            workspace_display_name?: string;
            draft_step?: number;
          };
        };

        if (cancelled) return;

        const st = profileJson.workspace_onboarding_status ?? null;
        setStatus(st);

        if (!isReview && st !== "pending") {
          router.replace("/dashboard");
          return;
        }

        const wo = profileJson.workspace_onboarding ?? {};
        let name =
          (typeof wo.workspace_display_name === "string" ? wo.workspace_display_name : "") ||
          "";
        let nameFromTeamSettings: string | null = null;
        if (teamRes.ok) {
          try {
            const tjson = (await teamRes.json()) as { team_name?: string | null };
            const tn = (tjson.team_name ?? "").trim();
            if (tn.length >= 2) {
              name = tn;
              nameFromTeamSettings = tn;
            }
          } catch {
            /* keep profile name */
          }
        }
        setWorkspaceName(name);
        setTeamWorkspaceNameFromSettings(nameFromTeamSettings);
        if (wo.collaboration_mode === "solo" || wo.collaboration_mode === "team") {
          setCollaboration(wo.collaboration_mode);
        }
        if (wo.team_type && TEAM_TYPES.includes(wo.team_type as TeamType)) {
          setTeamType(wo.team_type as TeamType);
        }
        if (wo.use_case && USE_CASES.includes(wo.use_case as UseCase)) {
          setUseCase(wo.use_case as UseCase);
        }
        if (typeof wo.preferred_performance_region === "string") {
          setRegion(wo.preferred_performance_region);
        }

        let initialStep =
          typeof wo.draft_step === "number" && wo.draft_step >= 0 && wo.draft_step <= 2
            ? wo.draft_step
            : 0;
        try {
          const raw = localStorage.getItem(stepStorageKey(user.uid));
          if (raw !== null) {
            const ls = Number.parseInt(raw, 10);
            if (!Number.isNaN(ls) && ls >= 0 && ls <= 2) {
              initialStep = Math.max(initialStep, ls);
            }
          }
        } catch {
          /* ignore */
        }
        setStep(initialStep);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, router, isReview]);

  useEffect(() => {
    if (!loading && user && !startedRef.current) {
      startedRef.current = true;
      logWorkspaceOnboardingEvent("wizard_started", {
        review: isReview,
        version: 1,
      });
    }
  }, [loading, user, isReview]);

  useEffect(() => {
    if (loading || !user) return;
    if (step !== lastStepRef.current) {
      lastStepRef.current = step;
      logWorkspaceOnboardingEvent("step_viewed", { step_id: ["name", "workstyle", "region"][step], step });
    }
  }, [step, loading, user]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => {
      if (
        document.visibilityState === "hidden" &&
        startedRef.current &&
        !completedRef.current
      ) {
        logWorkspaceOnboardingEvent("wizard_abandoned", { step });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [step]);

  const canNextStep0 = workspaceName.trim().length >= 2;
  const canNextStep1 = Boolean(collaboration && teamType && useCase);
  const canSubmit = Boolean(region && canNextStep0 && canNextStep1);

  const goNext = async () => {
    if (step === 0 && !canNextStep0) {
      setError("Enter a workspace name (at least 2 characters).");
      return;
    }
    if (step === 1 && !canNextStep1) {
      setError("Choose how you work, your team type, and a primary use case.");
      return;
    }
    setError(null);
    if (step < 2) {
      const next = step + 1;
      setStep(next);
      persistStepLocal(next);
      await patchDraft({
        workspace_display_name: normalizeWorkspaceNameInput(workspaceName),
        collaboration_mode: collaboration || undefined,
        team_type: teamType || undefined,
        use_case: useCase || undefined,
        preferred_performance_region: region || undefined,
        draft_step: next,
      });
      logWorkspaceOnboardingEvent("step_completed", {
        step_id: ["name", "workstyle", "region"][step],
        step,
      });
    }
  };

  const goBack = () => {
    if (step <= 0) return;
    const prev = step - 1;
    setStep(prev);
    persistStepLocal(prev);
    void patchDraft({ draft_step: prev });
  };

  const handleSubmit = async () => {
    if (!user || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const isCompletedProfile = status === "completed";
      const body: Record<string, unknown> = {
        workspace_display_name: normalizeWorkspaceNameInput(workspaceName),
        collaboration_mode: collaboration,
        team_type: teamType,
        use_case: useCase,
        preferred_performance_region: region,
      };
      if (isReview && isCompletedProfile) {
        body.review = true;
      }

      const res = await fetch("/api/workspace-onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not save");

      completedRef.current = true;
      logWorkspaceOnboardingEvent("wizard_completed", { version: 1, review: !!body.review });
      try {
        if (user?.uid) localStorage.removeItem(stepStorageKey(user.uid));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new Event("subscription-updated"));
      refetchSubscription();
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = useMemo(() => ((step + 1) / 3) * 100, [step]);

  /** Server ignores typed renames when team_name already exists — except review+completed (see API). */
  const workspaceNameFieldReadOnly =
    (teamWorkspaceNameFromSettings?.trim().length ?? 0) >= 2 &&
    !(isReview && status === "completed");

  if (!user) return null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
        <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" aria-hidden />
        <span className="sr-only">Loading setup</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-10 dark:bg-neutral-950 sm:py-16">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <BizziLogoMark width={56} height={56} className="opacity-90" alt="Bizzi Cloud" />
          <p className="text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
            {isReview ? "Update your workspace" : "Welcome"}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            {isReview ? "Workspace preferences" : "Set up your workspace"}
          </h1>
          <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
            A quick, three-step setup so Bizzi Cloud matches how you work. You can change this
            anytime in Settings.
          </p>
        </div>

        <div
          className="mb-6 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-bizzi-blue via-cyan-400 to-emerald-400 transition-[width] duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white to-neutral-50 shadow-2xl dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-950">
          <div
            className="h-1 w-full bg-gradient-to-r from-bizzi-blue via-cyan-400 to-emerald-400"
            aria-hidden
          />
          <div className="p-6 sm:p-8">
            {error ? (
              <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}

            {step === 0 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Workspace name
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  This matches your <strong className="font-medium text-neutral-800 dark:text-neutral-200">team
                  workspace name</strong> in Team settings when that exists. Until you have a team
                  workspace row, we store it as a setup preference on your profile.
                </p>
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Name <span className="text-red-500">*</span>
                  </span>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    maxLength={120}
                    autoComplete="organization"
                    placeholder="e.g. Northlight Post"
                    disabled={workspaceNameFieldReadOnly}
                    readOnly={workspaceNameFieldReadOnly}
                    className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 shadow-sm outline-none ring-bizzi-blue/30 placeholder:text-neutral-400 focus:border-bizzi-blue focus:ring-2 disabled:cursor-not-allowed disabled:opacity-80 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                  />
                </label>
                {workspaceNameFieldReadOnly ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Already set as your team workspace name. Open{" "}
                    <Link
                      href={`/team/${user.uid}/settings`}
                      className="font-medium text-bizzi-blue underline dark:text-bizzi-cyan"
                    >
                      Team settings
                    </Link>{" "}
                    to rename, or use <strong className="font-medium">Workspace setup</strong> from
                    Settings (review mode) to change it here.
                  </p>
                ) : null}
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-6">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  How you work
                </h2>
                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Solo or team?
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        ["solo", "Mostly solo"],
                        ["team", "With collaborators"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setCollaboration(id)}
                        className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition ${
                          collaboration === id
                            ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-cyan dark:bg-bizzi-blue/15 dark:text-bizzi-cyan"
                            : "border-neutral-200 bg-white text-neutral-800 hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Team type
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_TYPES.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTeamType(id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          teamType === id
                            ? "border-bizzi-blue bg-bizzi-blue text-white dark:border-bizzi-cyan dark:bg-bizzi-blue"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                        }`}
                      >
                        {TEAM_TYPE_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                    Primary use case
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {USE_CASES.map((id) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setUseCase(id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          useCase === id
                            ? "border-bizzi-blue bg-bizzi-blue text-white dark:border-bizzi-cyan dark:bg-bizzi-blue"
                            : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                        }`}
                      >
                        {USE_CASE_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                  Preferred performance region
                </h2>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Choose the area closest to you and your collaborators. This is a preference that
                  helps guide performance as our media network expands — not an immediate
                  infrastructure change.
                </p>
                <div className="space-y-2">
                  {WORKSPACE_PERFORMANCE_REGIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRegion(r.id)}
                      className={`flex w-full flex-col rounded-xl border px-4 py-3 text-left transition ${
                        region === r.id
                          ? "border-bizzi-blue bg-bizzi-blue/10 dark:border-bizzi-cyan dark:bg-bizzi-blue/15"
                          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-600 dark:bg-neutral-800/80"
                      }`}
                    >
                      <span className="text-sm font-semibold text-neutral-900 dark:text-white">
                        {r.label}
                      </span>
                      <span className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                        {r.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-wrap gap-3">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="rounded-xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-100 dark:hover:bg-neutral-800"
                >
                  Back
                </button>
              ) : null}
              <div className="ml-auto flex gap-3">
                {step < 2 ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void goNext()}
                    className="rounded-xl bg-bizzi-blue px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/25 hover:bg-bizzi-cyan disabled:opacity-50"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={submitting || !canSubmit}
                    onClick={() => void handleSubmit()}
                    className="inline-flex items-center gap-2 rounded-xl bg-bizzi-blue px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/25 hover:bg-bizzi-cyan disabled:pointer-events-none disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isReview && status === "completed" ? "Save changes" : "Finish setup"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function WorkspaceSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-100 dark:bg-neutral-950">
          <Loader2 className="h-10 w-10 animate-spin text-bizzi-blue" />
        </div>
      }
    >
      <WorkspaceSetupInner />
    </Suspense>
  );
}
