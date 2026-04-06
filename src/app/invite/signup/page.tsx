"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { getAuthToken } from "@/lib/auth-token";

function InviteSignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim();
  const emailParam = searchParams.get("email") ?? "";

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailParam);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (emailParam) setEmail(emailParam);
  }, [emailParam]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password || password.length < 6) return;
    if (!token) {
      setError("Invalid invite link. Missing token.");
      return;
    }

    setLoading(true);
    setError(null);

    const auth = getFirebaseAuth();

    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await getAuthToken(true);
      if (!idToken) {
        setError("Session error. Please try again.");
        setLoading(false);
        return;
      }

      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/account/create-free`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ display_name: name.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to create account");
        setLoading(false);
        return;
      }

      router.push(`/invite/join?token=${encodeURIComponent(token)}`);
      router.refresh();
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : null;
      const msg =
        code === "auth/email-already-in-use"
          ? "An account with this email already exists. Sign in instead."
          : err instanceof Error
            ? err.message
            : "An error occurred";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">
            Invalid invite link. No token provided.
          </p>
          <Link
            href="/"
            className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 mb-8"
        >
          <BizziLogoMark width={36} height={36} />
          <span className="font-semibold text-xl tracking-tight">
            Bizzi <span className="text-bizzi-blue">Cloud</span>
          </span>
        </Link>

        <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
            Create account to join
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
            Create your free account to accept this invite.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="invite-signup-name"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Name
              </label>
              <input
                id="invite-signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="Your name"
              />
            </div>
            <div>
              <label
                htmlFor="invite-signup-email"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Email
              </label>
              <input
                id="invite-signup-email"
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
                htmlFor="invite-signup-password"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="invite-signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="At least 6 characters"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !name.trim() ||
                !email.trim() ||
                !password ||
                password.length < 6
              }
              className="w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Creating account…" : "Create account & continue"}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Already have an account?{" "}
            <Link
              href={`/login?redirect=${encodeURIComponent(`/invite/join?token=${token}`)}`}
              className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
            >
              Sign in
            </Link>
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
              Firebase not configured. Sign-up requires Firebase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteSignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <InviteSignupContent />
    </Suspense>
  );
}
