"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";

interface InviteInfo {
  organization_id: string;
  org_name: string;
  email: string;
  role?: string;
}

function InviteJoinContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim();
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Invite link is invalid. No token provided.");
      setLoading(false);
      return;
    }

    const base = typeof window !== "undefined" ? window.location.origin : "";
    fetch(`${base}/api/enterprise/invite-by-token?token=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) throw new Error("Invite not found or already accepted.");
          throw new Error("Failed to load invite.");
        }
        return res.json();
      })
      .then((data: InviteInfo) => setInvite(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load invite."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!user || !invite) return;
    setAccepting(true);
    setError(null);
    try {
      const authToken = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const body: { invite_token?: string; organization_id?: string } = {};
      if (token) body.invite_token = token;
      body.organization_id = invite.organization_id;
      const res = await fetch(`${base}/api/enterprise/accept-invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to accept invite.");
      router.push("/enterprise");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOutAndUse = async () => {
    const url = `/invite/signup?token=${encodeURIComponent(token ?? "")}&email=${encodeURIComponent(invite?.email ?? "")}`;
    setSigningOut(true);
    try {
      await signOut(getFirebaseAuth());
      router.push(url);
    } catch {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <p className="text-neutral-500 dark:text-neutral-400">Loading invite...</p>
      </div>
    );
  }

  // Wait for auth to be ready before showing user-specific UI to avoid showing wrong branch
  if (invite && authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <p className="text-neutral-500 dark:text-neutral-400">Checking your account...</p>
      </div>
    );
  }

  if (error && !invite) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
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

  if (!invite) return null;

  const userEmail = user?.email?.trim().toLowerCase() ?? "";
  const inviteEmail = (invite.email ?? "").trim().toLowerCase();
  const emailMatches = userEmail.length > 0 && inviteEmail.length > 0 && userEmail === inviteEmail;

  const signUpUrl = `/invite/signup?token=${encodeURIComponent(token ?? "")}&email=${encodeURIComponent(invite.email)}`;
  const signInUrl = `/login?redirect=${encodeURIComponent(`/invite/join?token=${token}`)}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
      <div className="w-full max-w-md">
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
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white mb-2">
            {invite.role === "admin"
              ? `Activate ${invite.org_name}`
              : `Join ${invite.org_name}`}
          </h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
            {invite.role === "admin"
              ? "Your payment was received. Activate your organization account to access your dashboard."
              : "You've been invited to join as a member."}
          </p>

          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                {invite.role === "admin"
                  ? (
                    <>Create an account with <strong>{invite.email}</strong> to activate your organization.</>
                  )
                  : (
                    <>Create an account with <strong>{invite.email}</strong> to accept this invite.</>
                  )}
              </p>
              <div className="flex flex-col gap-2">
                <Link
                  href={signUpUrl}
                  className="block w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
                >
                  {invite.role === "admin" ? "Sign up to activate" : "Sign up to join"}
                </Link>
                <Link
                  href={signInUrl}
                  className="block w-full rounded-lg border border-neutral-200 px-4 py-2.5 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  Already have an account? Sign in
                </Link>
              </div>
            </div>
          ) : emailMatches ? (
            <div className="space-y-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                You&apos;re signed in as <strong>{user.email}</strong>.
              </p>
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              <button
                type="button"
                onClick={handleAccept}
                disabled={accepting}
                className="w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {accepting
                  ? invite.role === "admin"
                    ? "Activating…"
                    : "Accepting…"
                  : invite.role === "admin"
                    ? "Activate account"
                    : "Accept invite"}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                This invite was sent to <strong>{invite.email}</strong>, but you&apos;re signed in as{" "}
                <strong>{user.email}</strong>.
              </p>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Sign out and create an account with {invite.email} to accept this invite, or ask the
                organization admin to send a new invite to your current email.
              </p>
              <button
                type="button"
                onClick={handleSignOutAndUse}
                disabled={signingOut}
                className="block w-full rounded-lg border border-neutral-200 px-4 py-2.5 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                {signingOut ? "Signing out…" : `Sign out and use ${invite.email}`}
              </button>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="hover:underline">
            Back to home
          </Link>
        </p>

        {!isFirebaseConfigured() && (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Firebase not configured. Invite flow requires Firebase.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteJoinPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <InviteJoinContent />
    </Suspense>
  );
}
