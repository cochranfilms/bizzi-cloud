"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { ArrowRight, CheckCircle2, Shield } from "lucide-react";

export default function SignedOutPage() {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-90 dark:opacity-100"
        aria-hidden
      >
        <div className="absolute -left-1/4 top-0 h-[min(520px,70vh)] w-[70%] rounded-full bg-gradient-to-br from-sky-200/70 via-cyan-200/50 to-transparent blur-3xl dark:from-sky-500/20 dark:via-cyan-500/10 dark:to-transparent" />
        <div className="absolute -right-1/4 bottom-0 h-[min(480px,65vh)] w-[65%] rounded-full bg-gradient-to-tl from-bizzi-blue/25 via-sky-300/30 to-transparent blur-3xl dark:from-bizzi-cyan/15 dark:via-sky-500/10 dark:to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(14,165,233,0.12),transparent)] dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_-15%,rgba(34,211,238,0.08),transparent)]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-12 sm:px-6">
        <Link
          href="/"
          className={`mb-10 flex items-center gap-2.5 transition-all duration-700 ease-out ${
            entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
        >
          <BizziLogoMark width={40} height={40} className="rounded-lg shadow-sm" alt="Bizzi Cloud" />
          <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-xl">
            Bizzi{" "}
            <span className="bg-gradient-to-r from-bizzi-blue to-cyan-500 bg-clip-text text-transparent dark:from-bizzi-cyan dark:to-sky-400">
              Cloud
            </span>
          </span>
        </Link>

        <div
          className={`w-full max-w-md transition-all duration-700 ease-out ${
            entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
          style={{ transitionDelay: entered ? "80ms" : "0ms" }}
        >
          <div className="rounded-2xl border border-neutral-200/80 bg-white/85 p-8 shadow-[0_24px_48px_-12px_rgba(14,116,144,0.12),0_0_0_1px_rgba(255,255,255,0.6)_inset] backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/75 dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.04)_inset] sm:p-10">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/25 to-cyan-500/20 ring-1 ring-emerald-500/30 dark:from-emerald-400/15 dark:to-cyan-500/10 dark:ring-emerald-400/25">
              <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" strokeWidth={1.75} aria-hidden />
            </div>

            <h1 className="text-center text-2xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-[1.65rem]">
              You&apos;re signed out
            </h1>
            <p className="mx-auto mt-3 max-w-[28ch] text-center text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              Your session has ended securely. Sign back in anytime to pick up where you left off.
            </p>

            <div className="mt-6 flex items-start gap-3 rounded-xl border border-neutral-100 bg-neutral-50/80 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/40">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-bizzi-blue dark:text-bizzi-cyan" aria-hidden />
              <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                If you shared this device, you&apos;re no longer connected to your Bizzi Cloud account in this browser.
              </p>
            </div>

            <div className="mt-8 flex flex-col gap-3">
              <Link
                href="/login"
                className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-bizzi-blue to-cyan-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110 hover:shadow-xl dark:from-bizzi-cyan dark:to-sky-600 dark:shadow-cyan-500/15"
              >
                Sign back in
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
              <Link
                href="/"
                className="text-center text-sm font-medium text-neutral-600 underline-offset-4 transition hover:text-bizzi-blue hover:underline dark:text-neutral-400 dark:hover:text-bizzi-cyan"
              >
                Back to home
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-xs text-neutral-500 dark:text-neutral-500">
            Bizzi Cloud · Secure cloud storage for creators
          </p>
        </div>
      </div>
    </div>
  );
}
