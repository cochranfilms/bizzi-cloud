"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { notifyTeamWorkspaceUpdated } from "@/context/PersonalTeamWorkspaceContext";
import { sumExtraTeamSeats } from "@/lib/team-seat-pricing";
import { Sparkles, ImageIcon, Loader2, Users } from "lucide-react";

/**
 * After purchasing personal team seats, require a team name (logo optional)
 * before using the app. Shown on personal dashboard and on the owner's own team workspace.
 */
export default function TeamBrandingOnboardingGate() {
  const { user } = useAuth();
  const { teamSeatCounts, loading: subLoading } = useSubscription();
  const pathname = usePathname();
  const extraSeats = sumExtraTeamSeats(teamSeatCounts);

  const isTeamRoute = typeof pathname === "string" && pathname.startsWith("/team/");
  const teamOwnerFromPath = isTeamRoute ? pathname.split("/")[2] ?? null : null;
  const shouldEvaluateOwner =
    Boolean(user) && (teamOwnerFromPath === null || teamOwnerFromPath === user?.uid);

  const [gateResolved, setGateResolved] = useState(false);
  const [needsBranding, setNeedsBranding] = useState(false);

  useEffect(() => {
    if (!user || subLoading) return;

    if (extraSeats === 0 || !shouldEvaluateOwner) {
      setNeedsBranding(false);
      setGateResolved(true);
      return;
    }

    let cancelled = false;
    setGateResolved(false);

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(
          `/api/personal-team/settings?owner_uid=${encodeURIComponent(user.uid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!res.ok || cancelled) {
          if (!cancelled) {
            setNeedsBranding(false);
            setGateResolved(true);
          }
          return;
        }
        const data = (await res.json()) as { team_name: string | null };
        const hasName = Boolean((data.team_name ?? "").trim());
        if (!cancelled) {
          setNeedsBranding(!hasName);
          setGateResolved(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsBranding(false);
          setGateResolved(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, subLoading, extraSeats, shouldEvaluateOwner]);

  if (!gateResolved || !needsBranding || !user) return null;

  return (
    <TeamBrandingOnboardingModal
      ownerUid={user.uid}
      onComplete={() => setNeedsBranding(false)}
    />
  );
}

function TeamBrandingOnboardingModal({
  ownerUid,
  onComplete,
}: {
  ownerUid: string;
  onComplete: () => void;
}) {
  const { user } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please choose an image (PNG, JPG, Webp, or GIF).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image must be under 2 MB.");
      return;
    }
    setLogoError(null);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = useCallback(async () => {
    if (!user) return;
    const trimmed = teamName.trim();
    if (trimmed.length < 2) {
      setNameError("Enter a team name (at least 2 characters).");
      return;
    }
    setNameError(null);
    setSubmitting(true);
    try {
      const token = await user.getIdToken();
      const patchRes = await fetch(
        `/api/personal-team/settings?owner_uid=${encodeURIComponent(ownerUid)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ team_name: trimmed }),
        }
      );
      if (!patchRes.ok) {
        const data = (await patchRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save team name");
      }

      if (logoFile) {
        const formData = new FormData();
        formData.append("logo", logoFile);
        formData.append("team_owner_uid", ownerUid);
        const logoRes = await fetch("/api/personal-team/logo", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!logoRes.ok) {
          notifyTeamWorkspaceUpdated(ownerUid);
          onComplete();
          return;
        }
      }

      notifyTeamWorkspaceUpdated(ownerUid);
      onComplete();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [user, ownerUid, teamName, logoFile, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-neutral-950/75 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-branding-title"
      aria-describedby="team-branding-desc"
    >
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-white to-neutral-50 shadow-2xl dark:border-neutral-700 dark:from-neutral-900 dark:to-neutral-950">
        <div
          className="h-1.5 w-full bg-gradient-to-r from-bizzi-blue via-cyan-400 to-emerald-400"
          aria-hidden
        />
        <div className="p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-blue/25 dark:text-bizzi-cyan">
              <Users className="h-6 w-6" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
                You&apos;re almost set
              </p>
              <h2
                id="team-branding-title"
                className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white"
              >
                Name your team workspace
              </h2>
            </div>
          </div>

          <p id="team-branding-desc" className="mb-6 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            You have extra team seats — this name appears in the workspace switcher for you and your collaborators. Add
            a logo so invites and the team workspace feel on-brand (you can always change both in{" "}
            <span className="font-medium text-neutral-800 dark:text-neutral-200">Team settings</span>).
          </p>

          <div className="space-y-5">
            <div>
              <label htmlFor="onboarding-team-name" className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Team name <span className="text-red-500">*</span>
              </label>
              <input
                id="onboarding-team-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                maxLength={120}
                autoComplete="organization"
                placeholder="e.g. Northlight Post"
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-neutral-900 shadow-sm outline-none ring-bizzi-blue/30 placeholder:text-neutral-400 focus:border-bizzi-blue focus:ring-2 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
              />
              {nameError ? (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">{nameError}</p>
              ) : null}
            </div>

            <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-4 dark:border-neutral-600 dark:bg-neutral-800/50">
              <div className="mb-3 flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-neutral-900 dark:text-white">Add your logo</p>
                  <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                    Optional but recommended — it shows in the switcher and keeps the experience polished. If you skip
                    for now, we&apos;ll keep the Bizzi logo until you upload one in settings.
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob URL from user file
                    <img src={logoPreview} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Image src="/logo.png" alt="Bizzi" width={64} height={64} className="opacity-90" />
                  )}
                </div>
                <div className="flex w-full flex-1 flex-col gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    className="sr-only"
                    onChange={handleLogoSelect}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700/80"
                  >
                    <ImageIcon className="h-4 w-4" />
                    {logoFile ? "Choose a different image" : "Upload logo"}
                  </button>
                  {logoFile ? (
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{logoFile.name}</p>
                  ) : null}
                  {logoError ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400">{logoError}</p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting || teamName.trim().length < 2}
            onClick={() => void handleSubmit()}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-bizzi-blue py-3.5 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/25 transition hover:bg-bizzi-cyan disabled:pointer-events-none disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save &amp; continue
          </button>

          <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-500">
            Team name is required to continue. Logo can be added anytime in Team settings.
          </p>
        </div>
      </div>
    </div>
  );
}
