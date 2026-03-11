"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import Image from "next/image";

function AccountSetupContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId || !isFirebaseConfigured()) {
      setStatus("error");
      setError(
        !isFirebaseConfigured()
          ? "Configuration error. Please try again later."
          : "Missing checkout session. Please complete your purchase first."
      );
      return;
    }

    (async () => {
      try {
        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/account/create-from-checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = (await res.json()) as {
          customToken?: string;
          error?: string;
          existing_user?: boolean;
        };

        if (!res.ok) {
          setStatus("error");
          setError(
            data.existing_user
              ? "You already have an account. Please sign in."
              : data.error ?? "Failed to set up account"
          );
          if (data.existing_user) {
            router.replace("/login");
          }
          return;
        }

        if (!data.customToken) {
          setStatus("error");
          setError("Invalid response from server");
          return;
        }

        const auth = getFirebaseAuth();
        await signInWithCustomToken(auth, data.customToken);
        router.replace("/dashboard");
      } catch (err) {
        console.error("[account/setup]", err);
        setStatus("error");
        setError("Something went wrong. Please try again or contact support.");
      }
    })();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <Link
        href="/"
        className="flex items-center justify-center gap-2 mb-8"
      >
        <Image src="/logo.png" alt="Bizzi Byte" width={36} height={36} />
        <span className="font-semibold text-xl tracking-tight">
          Bizzi <span className="text-bizzi-blue">Cloud</span>
        </span>
      </Link>

      {status === "loading" && (
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Setting up your account...
          </h1>
          <p className="mt-2 text-neutral-500 dark:text-neutral-400">
            You&apos;ll be redirected to your dashboard shortly.
          </p>
        </div>
      )}

      {status === "error" && (
        <div className="rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 p-6 max-w-md text-center">
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
            Setup failed
          </h1>
          <p className="mt-2 text-neutral-600 dark:text-neutral-400">
            {error}
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Link
              href="/login"
              className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Sign in
            </Link>
            <Link
              href="/#pricing"
              className="text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            >
              Back to pricing
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function SetupFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <Link
        href="/"
        className="flex items-center justify-center gap-2 mb-8"
      >
        <Image src="/logo.png" alt="Bizzi Byte" width={36} height={36} />
        <span className="font-semibold text-xl tracking-tight">
          Bizzi <span className="text-bizzi-blue">Cloud</span>
        </span>
      </Link>
      <div className="text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent mx-auto mb-4" />
        <p className="text-neutral-500 dark:text-neutral-400">Loading...</p>
      </div>
    </div>
  );
}

export default function AccountSetupPage() {
  return (
    <Suspense fallback={<SetupFallback />}>
      <AccountSetupContent />
    </Suspense>
  );
}
