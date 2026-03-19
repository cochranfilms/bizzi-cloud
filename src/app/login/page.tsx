"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
} from "@/lib/firebase/client";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") || "/dashboard";
  const mode = searchParams.get("mode");
  const emailParam = searchParams.get("email") ?? "";
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const auth = getFirebaseAuth();

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        setMessage("Account created! Signing you in...");
        await signInWithEmailAndPassword(auth, email, password);
        router.push(redirectTo);
        router.refresh();
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        router.push(redirectTo);
        router.refresh();
      }
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : null;
      const msg =
        code === "auth/user-not-found" || code === "auth/invalid-credential"
          ? "No account found with this email. Create an account to continue."
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
          <Image src="/logo.png" alt="Bizzi Byte" width={36} height={36} />
          <span className="font-semibold text-xl tracking-tight">
            Bizzi <span className="text-bizzi-blue">Cloud</span>
          </span>
        </Link>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white mb-6">
            {isSignUp ? "Create account" : "Sign in"}
          </h1>

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
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {message && (
              <p className="text-sm text-bizzi-blue dark:text-bizzi-cyan">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Loading..." : isSignUp ? "Sign up" : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError(null);
                    setMessage(null);
                  }}
                  className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                >
                  Create a free account
                </button>
              </>
            )}
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="hover:underline">
            Back to home
          </Link>
        </p>

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
