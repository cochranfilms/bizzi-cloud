"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getAuthToken } from "@/lib/auth-token";

export interface FreeSignUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional redirect after sign-up (default: /dashboard) */
  redirectTo?: string;
}

export default function FreeSignUpModal({
  isOpen,
  onClose,
  redirectTo = "/dashboard",
}: FreeSignUpModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;

    setLoading(true);
    setError(null);

    const auth = getFirebaseAuth();

    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      const token = await getAuthToken(true);
      if (!token) {
        setError("Session error. Please try again.");
        setLoading(false);
        return;
      }

      const res = await fetch("/api/account/create-free", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ display_name: name.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error ?? "Failed to create account");
        setLoading(false);
        return;
      }

      onClose();
      router.push(redirectTo);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Get Started Free
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Create your free account with 2 GB storage
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="free-signup-name"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Name
            </label>
            <input
              id="free-signup-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder="Your name"
            />
          </div>
          <div>
            <label
              htmlFor="free-signup-email"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email
            </label>
            <input
              id="free-signup-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label
              htmlFor="free-signup-password"
              className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Password
            </label>
            <input
              id="free-signup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder="At least 6 characters"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !name.trim() ||
                !email.trim() ||
                !password ||
                password.length < 6
              }
              className="flex-1 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Creating account…" : "Get Started Free"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
