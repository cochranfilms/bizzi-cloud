"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BizziLogoMark from "@/components/BizziLogoMark";
import { useRouter } from "next/navigation";
import { FolderOpen, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import type { ShareFile } from "./SharePreviewModal";
import SharedFolderBrowser from "./SharedFolderBrowser";

interface ShareViewProps {
  token: string;
}

interface ShareData {
  folder_name: string;
  permission: string;
  files: ShareFile[];
}

export default function ShareView({ token }: ShareViewProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Authenticated users see the dashboard-style view
  useEffect(() => {
    if (user) {
      router.replace(`/dashboard/shared/${encodeURIComponent(token)}`);
      return;
    }
  }, [user, token, router]);

  useEffect(() => {
    if (user) return; // Redirect handles authenticated users
    let cancelled = false;
    async function fetchShare() {
      setError(null);
      setErrorCode(null);
      try {
        const headers: Record<string, string> = {};
        // No auth headers for unauthenticated share view
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
          headers,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) {
            setError(body.message ?? body.error ?? `Failed to load (${res.status})`);
            setErrorCode(body.error ?? null);
          }
          return;
        }
        if (!cancelled) setData(body);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchShare();
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const handleDownload = useCallback(
    async (file: ShareFile) => {
      setDownloadingId(file.id);
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download`, {
          method: "POST",
          headers,
          body: JSON.stringify({ object_key: file.object_key, name: file.name }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? body.error ?? "Download failed");
        }
        const { url } = await res.json();
        const a = document.createElement("a");
        a.href = url.startsWith("/") ? `${window.location.origin}${url}` : url;
        a.download = file.name;
        a.rel = "noopener noreferrer";
        a.click();
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setDownloadingId(null);
      }
    },
    [token, user]
  );

  const getAuthToken = useCallback(async () => {
    return user ? user.getIdToken() : null;
  }, [user]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 animate-pulse text-neutral-300 dark:text-neutral-600" />
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    const isExpired = error?.toLowerCase().includes("expired");
    const isPrivateAuth = errorCode === "private_share_requires_auth";

    if (isPrivateAuth) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
          <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                <Lock className="h-7 w-7" />
              </div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
                This folder is private
              </h1>
              <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                {error ?? "Sign in to access if you have been invited."}
              </p>
            </div>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/s/${token}`)}`}
              className="flex w-full items-center justify-center rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Sign in to access
            </Link>
            <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
              Don&apos;t have access? Ask the owner to add you by email.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          {isExpired ? "Share expired" : "Share not found"}
        </h1>
        <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This share may have been removed."}
        </p>
        <Link
          href="/"
          className="rounded-lg bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <BizziLogoMark width={28} height={28} alt="Bizzi Cloud" />
            <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {data.folder_name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Shared with you · {data.files.length}{" "}
            {data.files.length === 1 ? "file" : "files"}
          </p>
        </div>

        {data.files.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <p className="text-neutral-500 dark:text-neutral-400">
              This folder is empty.
            </p>
          </div>
        ) : (
          <SharedFolderBrowser
            shareToken={token}
            rootLabel={data.folder_name}
            files={data.files}
            getAuthToken={user ? getAuthToken : undefined}
            canDownload={data.permission !== "view"}
            onDownload={handleDownload}
            downloadingId={downloadingId}
            chrome="standalone"
          />
        )}
      </main>
    </div>
  );
}
