"use client";

import Image from "next/image";
import { FolderSync } from "lucide-react";
import { useCallback, useState } from "react";
import {
  CREATOR_TYPE_OPTIONS,
  CURRENT_CLOUD_PROVIDERS,
  EXCITED_FEATURE_OPTIONS,
  TB_NEED_OPTIONS,
  TEAM_SIZE_OPTIONS,
} from "@/lib/pre-registration-schema";
import { WAITLIST_DESCRIPTION } from "@/lib/seo";

const EXCITED_FEATURES_GRID = EXCITED_FEATURE_OPTIONS.slice(0, -1);
const EXCITED_FEATURE_LAST = EXCITED_FEATURE_OPTIONS[EXCITED_FEATURE_OPTIONS.length - 1]!;

const excitedCheckboxId = (opt: string) =>
  `wl-excited-${opt.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;

/** Light glassmorphism — frosted panel on sky gradient; readable slate typography. */
const shellGlass =
  "border border-white/55 bg-white/40 shadow-[0_12px_48px_rgba(14,116,144,0.12)] backdrop-blur-2xl ring-1 ring-white/35";

const inputCls =
  "w-full rounded-xl border border-slate-200/90 bg-white/55 px-3 py-2.5 text-sm text-slate-900 backdrop-blur-sm shadow-inner shadow-white/20 placeholder:text-slate-500 focus:border-bizzi-blue focus:outline-none focus:ring-2 focus:ring-sky-400/35 [&_option]:bg-white [&_option]:text-slate-900";

const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-600";

const requiredMark = "text-red-600";

/** Standalone waitlist form at `/waitlist` (not a full-page overlay). */
export default function WaitlistForm() {
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [socialProfile, setSocialProfile] = useState("");
  const [creatorType, setCreatorType] = useState<(typeof CREATOR_TYPE_OPTIONS)[number] | "">("");
  const [tbNeeded, setTbNeeded] = useState<(typeof TB_NEED_OPTIONS)[number] | "">("");
  const [excitedFeatures, setExcitedFeatures] = useState<
    (typeof EXCITED_FEATURE_OPTIONS)[number][]
  >([]);
  const [currentCloudProvider, setCurrentCloudProvider] = useState<
    (typeof CURRENT_CLOUD_PROVIDERS)[number] | ""
  >("");
  const [otherProvider, setOtherProvider] = useState("");
  const [currentSpend, setCurrentSpend] = useState("");
  const [teamSize, setTeamSize] = useState<(typeof TEAM_SIZE_OPTIONS)[number] | "">("");

  const toggleExcited = useCallback((opt: (typeof EXCITED_FEATURE_OPTIONS)[number]) => {
    setExcitedFeatures((prev) =>
      prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
    );
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setSubmitting(true);

    if (!tbNeeded) {
      setErrorBanner("Please select how much storage you need.");
      setSubmitting(false);
      return;
    }
    if (!currentCloudProvider) {
      setErrorBanner("Please select your current cloud provider.");
      setSubmitting(false);
      return;
    }
    if (currentCloudProvider === "Other" && !otherProvider.trim()) {
      setErrorBanner("Please name your cloud provider.");
      setSubmitting(false);
      return;
    }
    if (!creatorType) {
      setErrorBanner("Please select what type of creator you are.");
      setSubmitting(false);
      return;
    }
    if (excitedFeatures.length === 0) {
      setErrorBanner("Please select at least one thing you’re excited about in Bizzi Cloud.");
      setSubmitting(false);
      return;
    }
    if (!teamSize) {
      setErrorBanner("Please select how many people are on your team.");
      setSubmitting(false);
      return;
    }
    if (!socialProfile.trim()) {
      setErrorBanner("Please enter your social media profile or URL.");
      setSubmitting(false);
      return;
    }
    if (!currentSpend.trim()) {
      setErrorBanner("Please enter how much you currently pay for cloud storage.");
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch("/api/hubspot/pre-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          socialProfile: socialProfile.trim(),
          creatorType,
          tbNeeded,
          excitedFeatures,
          currentCloudProvider,
          otherProvider: currentCloudProvider === "Other" ? otherProvider.trim() : undefined,
          currentSpend: currentSpend.trim(),
          teamSize,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setErrorBanner(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSuccess(true);
    } catch {
      setErrorBanner("Network error. Please check your connection and try again.");
    }
    setSubmitting(false);
  };

  return (
    <div
      className={`w-full max-w-[min(100%,42rem)] shrink-0 rounded-t-[2.75rem] rounded-b-[3.5rem] px-6 py-10 sm:max-w-2xl sm:rounded-t-[3.25rem] sm:rounded-b-[4rem] sm:px-9 sm:py-12 md:max-w-3xl md:px-11 md:py-14 ${shellGlass}`}
    >
      {!success ? (
        <header className="mb-8 flex flex-col items-center text-center sm:mb-10">
          <Image
            src="/logo.png"
            alt="Bizzi Cloud"
            width={48}
            height={48}
            className="mb-5 h-12 w-12 object-contain sm:mb-6"
            priority
          />
          <h1
            id="waitlist-hero"
            className="text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl md:text-4xl"
          >
            Pre-register for Bizzi Cloud
          </h1>
          <p
            id="waitlist-form-intro"
            className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-slate-700 sm:mt-5 sm:text-base"
          >
            {WAITLIST_DESCRIPTION}
          </p>
        </header>
      ) : null}

      {success ? (
        <div
          className="rounded-2xl border border-sky-200/70 bg-white/55 px-5 py-10 text-center shadow-inner shadow-sky-100/50 backdrop-blur-xl sm:px-8 sm:py-12"
          role="status"
          aria-live="polite"
        >
          <p className="text-balance text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            You&apos;ve Successfully Pre Registered!
          </p>
          <p className="mt-5 text-lg font-semibold text-sky-500 sm:text-xl">
            You&apos;re on the list!
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-7 md:space-y-8" noValidate aria-busy={submitting}>
          {errorBanner ? (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50/95 px-4 py-3.5 text-sm text-red-900 shadow-sm backdrop-blur-sm"
            >
              {errorBanner}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 md:gap-y-6">
            <div className="sm:col-span-2">
              <label htmlFor="wl-full-name" className={labelCls}>
                Full name <span className={requiredMark}>*</span>
              </label>
              <input
                id="wl-full-name"
                name="fullName"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="wl-email" className={labelCls}>
                Email <span className={requiredMark}>*</span>
              </label>
              <input
                id="wl-email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="wl-phone" className={labelCls}>
                Phone <span className={requiredMark}>*</span>
              </label>
              <input
                id="wl-phone"
                name="phone"
                type="tel"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="wl-social" className={labelCls}>
                Social media profile <span className={requiredMark}>*</span>
              </label>
              <input
                id="wl-social"
                name="socialProfile"
                required
                minLength={2}
                maxLength={500}
                value={socialProfile}
                onChange={(e) => setSocialProfile(e.target.value)}
                placeholder="@handle or profile URL"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-creator-type" className={labelCls}>
                What type of creator are you? <span className={requiredMark}>*</span>
              </label>
              <select
                id="wl-creator-type"
                name="creatorType"
                required
                value={creatorType}
                onChange={(e) =>
                  setCreatorType(e.target.value as (typeof CREATOR_TYPE_OPTIONS)[number] | "")
                }
                className={inputCls}
              >
                <option value="">Select one</option>
                {CREATOR_TYPE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wl-tb" className={labelCls}>
                How many TB do you need? <span className={requiredMark}>*</span>
              </label>
              <select
                id="wl-tb"
                name="tbNeeded"
                required
                value={tbNeeded}
                onChange={(e) =>
                  setTbNeeded(e.target.value as (typeof TB_NEED_OPTIONS)[number] | "")
                }
                className={inputCls}
              >
                <option value="">Select capacity</option>
                {TB_NEED_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="wl-provider" className={labelCls}>
                Who are you currently with? <span className={requiredMark}>*</span>
              </label>
              <select
                id="wl-provider"
                name="currentCloudProvider"
                required
                value={currentCloudProvider}
                onChange={(e) =>
                  setCurrentCloudProvider(
                    e.target.value as (typeof CURRENT_CLOUD_PROVIDERS)[number] | "",
                  )
                }
                className={inputCls}
              >
                <option value="">Select provider</option>
                {CURRENT_CLOUD_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            {currentCloudProvider === "Other" ? (
              <div className="sm:col-span-2">
                <label htmlFor="wl-other-provider" className={labelCls}>
                  Other cloud storage provider <span className={requiredMark}>*</span>
                </label>
                <input
                  id="wl-other-provider"
                  name="otherProvider"
                  required
                  value={otherProvider}
                  onChange={(e) => setOtherProvider(e.target.value)}
                  className={inputCls}
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <label htmlFor="wl-spend" className={labelCls}>
                How much do you currently pay for cloud storage?{" "}
                <span className={requiredMark}>*</span>
              </label>
              <input
                id="wl-spend"
                name="currentSpend"
                required
                maxLength={200}
                value={currentSpend}
                onChange={(e) => setCurrentSpend(e.target.value)}
                placeholder="$20/mo, $75 per month, Not sure…"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="wl-team-size" className={labelCls}>
                How many people are on your team? <span className={requiredMark}>*</span>
              </label>
              <select
                id="wl-team-size"
                name="teamSize"
                required
                value={teamSize}
                onChange={(e) =>
                  setTeamSize(e.target.value as (typeof TEAM_SIZE_OPTIONS)[number] | "")
                }
                className={inputCls}
              >
                <option value="">Select team size</option>
                {TEAM_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            role="group"
            aria-labelledby="wl-excited-heading"
            className="rounded-2xl border border-white/50 bg-white/35 px-4 py-5 shadow-inner shadow-white/15 backdrop-blur-md sm:px-5 sm:py-6"
          >
            <p id="wl-excited-heading" className={labelCls}>
              What are you most excited to see in Bizzi Cloud? <span className={requiredMark}>*</span>
            </p>
            <p className="mb-4 mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
              Select all that apply — at least one is required.
            </p>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
              {EXCITED_FEATURES_GRID.map((opt) => {
                const id = excitedCheckboxId(opt);
                return (
                  <li key={opt}>
                    <label
                      htmlFor={id}
                      className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-2 py-2.5 hover:border-sky-300/50 sm:min-h-0"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={excitedFeatures.includes(opt)}
                        onChange={() => toggleExcited(opt)}
                        className="mt-1 h-4 w-4 rounded border-slate-400 bg-white/80 text-bizzi-blue focus:ring-2 focus:ring-bizzi-blue/30"
                      />
                      <span className="text-sm font-medium text-slate-800">{opt}</span>
                    </label>
                  </li>
                );
              })}
              <li className="col-span-full flex justify-center sm:pt-0.5">
                <label
                  htmlFor={excitedCheckboxId(EXCITED_FEATURE_LAST)}
                  className="flex min-h-[44px] w-full max-w-md cursor-pointer items-start justify-center gap-2.5 rounded-lg border border-transparent px-2 py-2.5 hover:border-sky-300/50 sm:min-h-0 sm:w-auto sm:max-w-[calc(50%-0.5rem)]"
                >
                  <input
                    id={excitedCheckboxId(EXCITED_FEATURE_LAST)}
                    type="checkbox"
                    checked={excitedFeatures.includes(EXCITED_FEATURE_LAST)}
                    onChange={() => toggleExcited(EXCITED_FEATURE_LAST)}
                    className="mt-1 h-4 w-4 shrink-0 rounded border-slate-400 bg-white/80 text-bizzi-blue focus:ring-2 focus:ring-bizzi-blue/30"
                  />
                  <span className="text-sm font-medium text-slate-800">{EXCITED_FEATURE_LAST}</span>
                </label>
              </li>
            </ul>
          </div>

          <div
            role="region"
            aria-label="Cloud migration to Bizzi Cloud"
            className="relative overflow-hidden rounded-2xl border border-sky-200/55 bg-gradient-to-br from-white/55 via-sky-50/45 to-cyan-50/40 px-4 py-4 shadow-[0_8px_30px_-8px_rgba(14,116,144,0.2)] backdrop-blur-md sm:px-5 sm:py-5"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-sky-400/25 blur-2xl"
              aria-hidden
            />
            <div
              className="pointer-events-none absolute -bottom-14 -left-8 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl"
              aria-hidden
            />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/70 bg-white/50 shadow-inner shadow-sky-200/40 backdrop-blur-sm sm:h-14 sm:w-14"
                aria-hidden
              >
                <FolderSync className="h-6 w-6 text-sky-600 sm:h-7 sm:w-7" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-800 sm:text-sm">
                  Cloud migration
                </p>
                <h3 className="mt-2 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">
                  Move your libraries without the lift-and-shift headaches
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Our <strong className="font-semibold text-slate-800">automated migration</strong>{" "}
                  path helps you move from the major platforms you already use—Dropbox and Google
                  Drive—so you land in Bizzi Cloud with fewer manual steps and a smoother
                  post-production workflow.
                </p>
              </div>
            </div>
          </div>

          <div className="flex w-full justify-center pt-1 sm:pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="touch-target inline-flex min-h-[48px] min-w-[min(100%,17rem)] items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-bizzi-blue px-10 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:brightness-105 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Submit pre-registration"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
