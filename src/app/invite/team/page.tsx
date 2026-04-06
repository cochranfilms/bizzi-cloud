"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { Loader2 } from "lucide-react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { onAuthStateChanged } from "firebase/auth";

function InviteTeamInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const acceptStarted = useRef(false);

  useEffect(() => {
    if (!token.trim()) {
      setStatus("error");
      setMessage("Missing invite link. Ask your team admin to resend the invite.");
      return;
    }
    if (!isFirebaseConfigured()) {
      setStatus("error");
      setMessage("App configuration error.");
      return;
    }

    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        const next = `/invite/team?token=${encodeURIComponent(token)}`;
        const loginUrl = `/login?redirect=${encodeURIComponent(next)}&email=`;
        router.replace(loginUrl);
        return;
      }
      if (acceptStarted.current) return;
      acceptStarted.current = true;
      setStatus("working");
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/personal-team/accept-invite", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token: token.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          team_owner_user_id?: string;
        };
        if (!res.ok) {
          acceptStarted.current = false;
          setStatus("error");
          setMessage(data.error ?? "Could not accept invite.");
          return;
        }
        const ownerId =
          typeof data.team_owner_user_id === "string" ? data.team_owner_user_id.trim() : "";
        setStatus("done");
        setMessage("You're on the team. Opening your team workspace…");
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("subscription-updated"));
          try {
            sessionStorage.setItem("bizzi-team-invite-accepted", "1");
          } catch {
            /* ignore */
          }
        }
        const dest = ownerId ? `/team/${ownerId}` : "/dashboard";
        router.replace(dest);
        router.refresh();
      } catch {
        acceptStarted.current = false;
        setStatus("error");
        setMessage("Something went wrong. Try again or contact support.");
      }
    });
    return () => unsub();
  }, [token, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 dark:bg-neutral-950">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <BizziLogoMark width={36} height={36} />
        <span className="text-xl font-semibold tracking-tight">
          Bizzi <span className="text-bizzi-blue">Cloud</span>
        </span>
      </Link>
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        {status === "working" || status === "idle" ? (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-bizzi-blue" />
            <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
              Joining your team…
            </p>
          </>
        ) : (
          <p
            className={`text-sm ${status === "error" ? "text-red-600 dark:text-red-400" : "text-neutral-700 dark:text-neutral-300"}`}
          >
            {message}
          </p>
        )}
        {status === "error" && (
          <div className="mt-6 space-y-3">
            <Link
              href="/login"
              className="block rounded-lg bg-bizzi-blue py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Sign in
            </Link>
            <Link href="/#pricing" className="block text-sm text-bizzi-blue hover:underline">
              Create an account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InviteTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue" />
        </div>
      }
    >
      <InviteTeamInner />
    </Suspense>
  );
}
