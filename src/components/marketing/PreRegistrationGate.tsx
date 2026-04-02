"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  CURRENT_CLOUD_PROVIDERS,
  EXCITED_FEATURE_OPTIONS,
  TB_NEED_OPTIONS,
} from "@/lib/pre-registration-schema";

const SESSION_DISMISS_KEY = "bizzi_pre_reg_dismissed";
/** Query param: `?bizzi_landing=1` — honored only when `NEXT_PUBLIC_BIZZI_LANDING_BYPASS_ENABLED` is `"true"`. */
const BYPASS_QUERY = "bizzi_landing";

const shellGlass =
  "border border-white/55 bg-white/45 shadow-[0_24px_80px_rgba(31,56,92,0.18)] backdrop-blur-xl dark:border-white/12 dark:bg-neutral-950/55 dark:shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

const inputCls =
  "w-full rounded-xl border border-white/60 bg-white/55 px-3 py-2.5 text-sm text-bizzi-navy shadow-sm backdrop-blur-sm placeholder:text-neutral-500 focus:border-bizzi-blue focus:outline-none focus:ring-2 focus:ring-bizzi-blue/25 dark:border-white/15 dark:bg-neutral-950/45 dark:text-sky-50 dark:placeholder:text-neutral-400";

const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-bizzi-navy/85 dark:text-sky-100/90";

function dismissGate() {
  try {
    sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Full-screen pre-registration overlay on the marketing home page. */
export default function PreRegistrationGate() {
  const [open, setOpen] = useState(true);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [socialProfile, setSocialProfile] = useState("");
  const [website, setWebsite] = useState("");
  const [tbNeeded, setTbNeeded] = useState<(typeof TB_NEED_OPTIONS)[number] | "">("");
  const [excitedFeatures, setExcitedFeatures] = useState<
    (typeof EXCITED_FEATURE_OPTIONS)[number][]
  >([]);
  const [currentCloudProvider, setCurrentCloudProvider] = useState<
    (typeof CURRENT_CLOUD_PROVIDERS)[number] | ""
  >("");
  const [otherProvider, setOtherProvider] = useState("");
  const [currentSpend, setCurrentSpend] = useState("");

  useEffect(() => {
    if (sessionStorage.getItem(SESSION_DISMISS_KEY) === "1") {
      setOpen(false);
    }
    if (process.env.NEXT_PUBLIC_BIZZI_LANDING_BYPASS_ENABLED === "true") {
      const params = new URLSearchParams(window.location.search);
      if (params.get(BYPASS_QUERY) === "1") {
        dismissGate();
        params.delete(BYPASS_QUERY);
        const qs = params.toString();
        const path = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
        window.history.replaceState(null, "", path);
        setOpen(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const visitLanding = useCallback(() => {
    dismissGate();
    setOpen(false);
  }, []);

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

    try {
      const res = await fetch("/api/hubspot/pre-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          socialProfile: socialProfile.trim() || undefined,
          website: website.trim() || "",
          tbNeeded,
          excitedFeatures,
          currentCloudProvider,
          otherProvider: currentCloudProvider === "Other" ? otherProvider.trim() : undefined,
          currentSpend: currentSpend.trim() || undefined,
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-bizzi-navy/35 px-3 py-6 backdrop-blur-md safe-area-inset dark:bg-black/55"
      aria-hidden={false}
    >
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(125,211,252,0.35),transparent)] dark:bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.12),transparent)]"
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pre-registration-title"
        className={`relative z-10 my-auto w-full max-w-2xl rounded-t-[2.75rem] rounded-b-[3.5rem] border border-white/50 px-5 py-8 sm:rounded-t-[3.25rem] sm:rounded-b-[4rem] sm:px-8 sm:py-10 md:max-w-3xl md:px-10 md:py-11 ${shellGlass}`}
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/logo.png"
            alt="Bizzi"
            width={48}
            height={48}
            className="mb-4 h-12 w-12 object-contain"
          />
          <h1
            id="pre-registration-title"
            className="text-balance text-2xl font-bold tracking-tight text-bizzi-navy dark:text-sky-50 sm:text-3xl md:text-4xl"
          >
            Pre Register for Bizzi Cloud
          </h1>
          <p className="mt-3 max-w-xl text-pretty text-sm leading-relaxed text-neutral-700 dark:text-neutral-200 sm:text-base">
            Tell us what you need most so we can build the fastest creator cloud experience for you.
          </p>
        </div>

        {success ? (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/90 px-5 py-8 text-center dark:border-emerald-500/30 dark:bg-emerald-950/40">
            <p className="text-lg font-semibold text-emerald-900 dark:text-emerald-100">
              You&apos;re on the list.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-emerald-800/95 dark:text-emerald-100/85">
              Thank you for pre-registering. Early access updates are coming soon—we&apos;ll be in
              touch when your spot opens.
            </p>
            <button
              type="button"
              onClick={visitLanding}
              className="mt-8 text-sm font-medium text-bizzi-navy underline decoration-bizzi-blue/50 underline-offset-4 hover:decoration-bizzi-blue dark:text-sky-100"
            >
              Visit Landing
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6" noValidate>
            {errorBanner ? (
              <div
                role="alert"
                className="rounded-xl border border-red-200/90 bg-red-50/95 px-4 py-3 text-sm text-red-900 dark:border-red-500/35 dark:bg-red-950/45 dark:text-red-100"
              >
                {errorBanner}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="pr-full-name" className={labelCls}>
                  Full name <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="pr-full-name"
                  name="fullName"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pr-email" className={labelCls}>
                  Email <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="pr-email"
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
                <label htmlFor="pr-phone" className={labelCls}>
                  Phone <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <input
                  id="pr-phone"
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
                <label htmlFor="pr-social" className={labelCls}>
                  Social media profile
                </label>
                <input
                  id="pr-social"
                  name="socialProfile"
                  value={socialProfile}
                  onChange={(e) => setSocialProfile(e.target.value)}
                  placeholder="@handle or profile URL"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pr-website" className={labelCls}>
                  Website
                </label>
                <input
                  id="pr-website"
                  name="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="pr-tb" className={labelCls}>
                  How many TB do you need? <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <select
                  id="pr-tb"
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
                <label htmlFor="pr-provider" className={labelCls}>
                  Who are you currently with?{" "}
                  <span className="text-red-600 dark:text-red-400">*</span>
                </label>
                <select
                  id="pr-provider"
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
                  <label htmlFor="pr-other-provider" className={labelCls}>
                    Other cloud storage provider <span className="text-red-600 dark:text-red-400">*</span>
                  </label>
                  <input
                    id="pr-other-provider"
                    name="otherProvider"
                    value={otherProvider}
                    onChange={(e) => setOtherProvider(e.target.value)}
                    className={inputCls}
                  />
                </div>
              ) : null}
              <div className="sm:col-span-2">
                <label htmlFor="pr-spend" className={labelCls}>
                  How much do you currently pay for cloud storage?
                </label>
                <input
                  id="pr-spend"
                  name="currentSpend"
                  value={currentSpend}
                  onChange={(e) => setCurrentSpend(e.target.value)}
                  placeholder="$20/mo, $75 per month, Not sure…"
                  className={inputCls}
                />
              </div>
            </div>

            <fieldset className="rounded-2xl border border-white/40 bg-white/30 px-4 py-4 dark:border-white/10 dark:bg-neutral-950/30">
              <legend className={`${labelCls} px-1`}>
                What are you most excited to see in Bizzi Cloud?
              </legend>
              <p className="mb-3 text-xs text-neutral-600 dark:text-neutral-400">Optional — select any that apply.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {EXCITED_FEATURE_OPTIONS.map((opt) => {
                  const id = `pr-excited-${opt.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
                  return (
                    <li key={opt}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-2 hover:border-white/40 dark:hover:border-white/10"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          checked={excitedFeatures.includes(opt)}
                          onChange={() => toggleExcited(opt)}
                          className="mt-1 h-4 w-4 rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
                        />
                        <span className="text-sm text-bizzi-navy dark:text-sky-100">{opt}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="submit"
                disabled={submitting}
                className="touch-target inline-flex min-h-[48px] items-center justify-center rounded-full bg-gradient-to-r from-bizzi-blue to-sky-500 px-8 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/25 transition hover:brightness-110 disabled:opacity-60"
              >
                {submitting ? "Sending…" : "Request early access"}
              </button>
            </div>
          </form>
        )}

        {!success ? (
          <div className="mt-8 flex justify-center border-t border-white/35 pt-6 dark:border-white/10">
            <button
              type="button"
              onClick={visitLanding}
              className="text-xs font-medium uppercase tracking-wider text-bizzi-navy/70 underline-offset-4 hover:text-bizzi-navy hover:underline dark:text-sky-200/80 dark:hover:text-sky-100"
            >
              Visit Landing
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
