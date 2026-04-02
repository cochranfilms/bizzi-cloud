"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
  CURRENT_CLOUD_PROVIDERS,
  EXCITED_FEATURE_OPTIONS,
  TB_NEED_OPTIONS,
} from "@/lib/pre-registration-schema";

/** Query param: `?bizzi_landing=1` — honored only when `NEXT_PUBLIC_BIZZI_LANDING_BYPASS_ENABLED` is `"true"`. */
const BYPASS_QUERY = "bizzi_landing";

/** Always dark — pre-reg gate ignores global landing light/dark preference. */
const shellGlass =
  "border border-white/12 bg-neutral-950/78 shadow-[0_24px_80px_rgba(0,0,0,0.5)] backdrop-blur-xl";

const inputCls =
  "w-full rounded-xl border border-white/15 bg-neutral-950/45 px-3 py-2.5 text-sm text-sky-50 shadow-sm backdrop-blur-sm placeholder:text-neutral-400 focus:border-bizzi-blue focus:outline-none focus:ring-2 focus:ring-bizzi-blue/25 [&_option]:bg-neutral-900 [&_option]:text-sky-50";

const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-sky-100/90";

const requiredMark = "text-red-400";

/** Matches `globals.css` dark landing gradient base so macOS overscroll rubber-band never flashes the light page. */
const GATE_OVERSCROLL_CANVAS = "#0a1628";

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
    if (process.env.NEXT_PUBLIC_BIZZI_LANDING_BYPASS_ENABLED === "true") {
      const params = new URLSearchParams(window.location.search);
      if (params.get(BYPASS_QUERY) === "1") {
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
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      overflow: body.style.overflow,
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
      htmlOs: html.style.overscrollBehavior,
      bodyOs: body.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    html.style.backgroundColor = GATE_OVERSCROLL_CANVAS;
    body.style.backgroundColor = GATE_OVERSCROLL_CANVAS;
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = prev.overflow;
      html.style.backgroundColor = prev.htmlBg;
      body.style.backgroundColor = prev.bodyBg;
      html.style.overscrollBehavior = prev.htmlOs;
      body.style.overscrollBehavior = prev.bodyOs;
    };
  }, [open]);

  const visitLanding = useCallback(() => {
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
      className="fixed inset-0 z-[200] overflow-y-auto overflow-x-hidden overscroll-none bg-[#0a1628]/98 text-sky-100 backdrop-blur-md [color-scheme:dark]"
      aria-hidden={false}
    >
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_-20%,rgba(56,189,248,0.14),transparent)]"
        aria-hidden
      />
      <div
        className="relative z-10 flex min-h-[100dvh] w-full flex-col items-center justify-center px-4 pt-[calc(1.75rem+env(safe-area-inset-top,0px))] pb-[calc(1.75rem+env(safe-area-inset-bottom,0px))] sm:px-6 sm:pt-[calc(2.75rem+env(safe-area-inset-top,0px))] sm:pb-[calc(2.75rem+env(safe-area-inset-bottom,0px))] md:px-8 md:pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pt-[calc(4.25rem+env(safe-area-inset-top,0px))] lg:pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))]"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pre-registration-title"
          className={`w-full max-w-[min(100%,42rem)] shrink-0 rounded-t-[2.75rem] rounded-b-[3.5rem] border border-white/12 px-6 py-10 sm:max-w-2xl sm:rounded-t-[3.25rem] sm:rounded-b-[4rem] sm:px-9 sm:py-12 md:max-w-3xl md:px-11 md:py-14 ${shellGlass}`}
        >
          <div className="mb-8 flex flex-col items-center text-center sm:mb-10">
            <Image
              src="/logo.png"
              alt="Bizzi"
              width={48}
              height={48}
              className="mb-5 h-12 w-12 object-contain sm:mb-6"
            />
            <h1
              id="pre-registration-title"
              className="text-balance text-2xl font-bold tracking-tight text-sky-50 sm:text-3xl md:text-4xl"
            >
              Pre Register for Bizzi Cloud
            </h1>
            <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-neutral-200 sm:mt-5 sm:text-base">
              Tell us what you need most so we can build the fastest creator cloud experience for you.
            </p>
          </div>

          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-9 text-center sm:px-7 sm:py-10">
              <p className="text-lg font-semibold text-emerald-100">You&apos;re on the list.</p>
              <p className="mt-3 text-sm leading-relaxed text-emerald-100/85">
                Thank you for pre-registering. Early access updates are coming soon—we&apos;ll be in
                touch when your spot opens.
              </p>
              <button
                type="button"
                onClick={visitLanding}
                className="mt-8 text-sm font-medium text-sky-100 underline decoration-bizzi-blue/50 underline-offset-4 hover:decoration-bizzi-blue"
              >
                Visit Landing
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-7 md:space-y-8" noValidate>
              {errorBanner ? (
                <div
                  role="alert"
                  className="rounded-xl border border-red-500/35 bg-red-950/45 px-4 py-3.5 text-sm text-red-100"
                >
                  {errorBanner}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-6 sm:gap-y-5 md:gap-y-6">
                <div className="sm:col-span-2">
                  <label htmlFor="pr-full-name" className={labelCls}>
                    Full name <span className={requiredMark}>*</span>
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
                    Email <span className={requiredMark}>*</span>
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
                    Phone <span className={requiredMark}>*</span>
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
                    How many TB do you need? <span className={requiredMark}>*</span>
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
                    Who are you currently with? <span className={requiredMark}>*</span>
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
                      Other cloud storage provider <span className={requiredMark}>*</span>
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

              <div
                role="group"
                aria-labelledby="pr-excited-heading"
                className="rounded-2xl border border-white/10 bg-neutral-950/30 px-4 py-5 sm:px-5 sm:py-6"
              >
                <p id="pr-excited-heading" className={labelCls}>
                  What are you most excited to see in Bizzi Cloud?
                </p>
                <p className="mb-4 mt-2 text-xs leading-relaxed text-neutral-400">
                  Optional — select any that apply.
                </p>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-2">
                  {EXCITED_FEATURE_OPTIONS.map((opt) => {
                    const id = `pr-excited-${opt.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
                    return (
                      <li key={opt}>
                        <label
                          htmlFor={id}
                          className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-2 py-2.5 hover:border-white/10 sm:min-h-0"
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={excitedFeatures.includes(opt)}
                            onChange={() => toggleExcited(opt)}
                            className="mt-1 h-4 w-4 rounded border-neutral-500 bg-neutral-900 text-bizzi-blue focus:ring-bizzi-blue"
                          />
                          <span className="text-sm text-sky-100">{opt}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="flex w-full justify-center pt-1 sm:pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="touch-target inline-flex min-h-[48px] min-w-[min(100%,17rem)] items-center justify-center rounded-full bg-gradient-to-r from-bizzi-blue to-sky-500 px-10 text-sm font-semibold text-white shadow-lg shadow-bizzi-blue/25 transition hover:brightness-110 disabled:opacity-60"
                >
                  {submitting ? "Sending…" : "Request early access"}
                </button>
              </div>
            </form>
          )}

          {!success ? (
            <div className="mt-10 flex justify-center border-t border-white/10 pt-8 sm:mt-12 sm:pt-9">
              <button
                type="button"
                onClick={visitLanding}
                className="text-xs font-medium uppercase tracking-wider text-sky-200/80 underline-offset-4 hover:text-sky-100 hover:underline"
              >
                Visit Landing
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
