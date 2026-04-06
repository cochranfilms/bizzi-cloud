"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import { signInWithEmailAndPassword } from "firebase/auth";
import { signInWithGooglePopup } from "@/lib/firebase/google-sign-in";
import GoogleOAuthButton from "@/components/auth/GoogleOAuthButton";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const emailParam = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      await signInWithGooglePopup();
      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code)
          : "";
      if (
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request"
      ) {
        setError(null);
      } else if (code === "auth/popup-blocked") {
        setError(
          "Your browser blocked the sign-in popup. Allow popups for this site and try again."
        );
      } else if (code === "auth/account-exists-with-different-credential") {
        setError(
          "This email already uses password sign-in. Use your email and password above, or reset your password."
        );
      } else if (code === "auth/operation-not-allowed") {
        setError("Google sign-in is not available. Use your email and password.");
      } else {
        setError("Google sign-in failed. Please try again or use email.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const auth = getFirebaseAuth();

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : null;
      const msg =
        code === "auth/user-not-found" || code === "auth/invalid-credential"
          ? "No account found with this email. Choose a plan from Pricing to create an account."
          : err instanceof Error
            ? err.message
            : "An error occurred";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-8"
        >
          <BizziLogoMark width={36} height={36} />
          <span className="font-semibold text-xl tracking-tight text-neutral-900 dark:text-neutral-100">
            Bizzi <span className="text-bizzi-blue dark:text-bizzi-cyan">Cloud</span>
          </span>
        </Link>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6">
            Sign in
          </h1>

          {isFirebaseConfigured() ? (
            <div className="mb-6 space-y-5">
              <GoogleOAuthButton
                disabled={loading || googleLoading}
                onClick={handleGoogleSignIn}
              >
                {googleLoading ? "Signing in with Google…" : "Continue with Google"}
              </GoogleOAuthButton>
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-neutral-200 dark:border-neutral-700" />
                </div>
                <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
                  <span className="bg-white px-3 text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                    or with email
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={googleLoading}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                disabled={googleLoading}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Don&apos;t have an account?{" "}
            <Link
              href="/#pricing"
              className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
            >
              Choose a plan from Pricing
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="hover:underline">
            Back to home
          </Link>
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/privacy" className="hover:text-bizzi-blue hover:underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="hover:text-bizzi-blue hover:underline">
            Terms of Service
          </Link>
          <Link href="/privacy#do-not-sell" className="hover:text-bizzi-blue hover:underline">
            Don&apos;t Sell My Data
          </Link>
        </div>

        {!isFirebaseConfigured() && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Firebase not configured. Add{" "}
              <code className="rounded bg-amber-200/50 px-1 dark:bg-amber-900/30">
                NEXT_PUBLIC_FIREBASE_*
              </code>{" "}
              vars to .env.local.
            </p>
            <Link
              href="/dashboard"
              className="mt-2 inline-block text-sm font-medium text-amber-700 hover:underline dark:text-amber-300"
            >
              Continue to dashboard (dev mode)
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
