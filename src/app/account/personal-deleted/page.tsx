"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { isFirebaseConfigured } from "@/lib/firebase/client";

interface AccountStatus {
  personal_status: string;
  personal_restore_available_until: string | null;
  enterprise_orgs: { id: string; name: string }[];
  redirect_to_interstitial: boolean;
}

export default function PersonalDeletedPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setLoading(false);
      return;
    }
    if (authLoading) return;
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent("/account/personal-deleted")}`);
      return;
    }

    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as AccountStatus;
        setStatus(data);
        if (!data.redirect_to_interstitial && data.personal_status === "active") {
          router.replace("/dashboard");
          return;
        }
      } catch (err) {
        console.error("[personal-deleted] Failed to fetch status:", err);
        setError("Failed to load account status.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, router]);

  const handleContinueToEnterprise = () => {
    router.push("/enterprise");
  };

  const handleRestorePersonal = async () => {
    if (!user) return;
    setRestoring(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/restore-personal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Restore failed");
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed. Please try again.");
    } finally {
      setRestoring(false);
    }
  };

  if (!isFirebaseConfigured()) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <p className="text-neutral-600 dark:text-neutral-400">Firebase not configured.</p>
        <Link href="/dashboard" className="mt-4 text-bizzi-blue hover:underline">
          Continue to dashboard
        </Link>
      </div>
    );
  }

  if (authLoading || loading || !status) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-neutral-50 dark:bg-neutral-950 px-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }

  const restoreDate = status.personal_restore_available_until
    ? new Date(status.personal_restore_available_until).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const orgList =
    status.enterprise_orgs.length > 0
      ? status.enterprise_orgs.map((o) => o.name).join(", ")
      : "";

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
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white mb-4">
            Personal account deleted
          </h1>

          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Your personal Bizzi Cloud account has been deleted
            {restoreDate && (
              <>
                {" "}
                and is recoverable until {restoreDate}.
              </>
            )}
            {orgList && (
              <>
                {" "}
                You still have access through{" "}
                {status.enterprise_orgs.length === 1
                  ? "1 enterprise workspace"
                  : `${status.enterprise_orgs.length} enterprise workspaces`}
                : {orgList}.
              </>
            )}
          </p>

          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
            You can continue into your team workspace or restore your personal account.
          </p>

          {error && (
            <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex flex-col gap-3">
            {status.enterprise_orgs.length > 0 && (
              <button
                type="button"
                onClick={handleContinueToEnterprise}
                className="w-full rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white hover:bg-bizzi-cyan transition-colors"
              >
                Continue to Enterprise Workspace
              </button>
            )}
            <button
              type="button"
              onClick={handleRestorePersonal}
              disabled={restoring || !restoreDate}
              className="w-full rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {restoring ? "Restoring..." : "Restore Personal Account"}
            </button>
          </div>

          {!restoreDate && (
            <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
              The restoration period has expired. Your personal data has been permanently purged.
            </p>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-neutral-500 dark:text-neutral-400">
          <Link href="/" className="hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
