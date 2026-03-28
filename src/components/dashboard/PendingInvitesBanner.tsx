"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Users, Loader2, X } from "lucide-react";

interface PendingInvite {
  seat_id: string;
  organization_id: string;
  organization_name: string;
  email: string;
  invited_at: string | null;
}

export default function PendingInvitesBanner() {
  const { user } = useAuth();
  const router = useRouter();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) {
      setInvites([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/enterprise/pending-invites", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setInvites(data.invites ?? []);
        }
      } catch {
        if (!cancelled) setInvites([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleAccept = async (orgId: string) => {
    if (!user) return;
    setAccepting(orgId);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/enterprise/accept-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ organization_id: orgId }),
      });
      const data = (await res.json().catch(() => ({}))) as { organization_id?: string };
      if (res.ok) {
        if (typeof data.organization_id === "string" && typeof window !== "undefined") {
          try {
            window.sessionStorage.setItem("bizzi-enterprise-org", data.organization_id);
          } catch {
            // ignore
          }
        }
        router.push("/enterprise");
        router.refresh();
      }
    } finally {
      setAccepting(null);
    }
  };

  if (loading || invites.length === 0 || dismissed) return null;

  return (
    <div className="border-b border-bizzi-blue/30 bg-bizzi-blue/5 px-4 py-3 dark:bg-bizzi-blue/10">
      <div className="mx-auto flex max-w-4xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Users className="h-5 w-5 shrink-0 text-bizzi-blue" />
          <p className="text-sm font-medium text-neutral-900 dark:text-white">
            You&apos;ve been invited to join {invites.length === 1 ? "an organization" : "organizations"}
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="ml-2 shrink-0 rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-200/50 hover:text-neutral-700 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {invites.map((inv) => (
            <div
              key={inv.organization_id}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
            >
              <span className="text-sm font-medium text-neutral-900 dark:text-white">
                {inv.organization_name || "Organization"}
              </span>
              <button
                type="button"
                onClick={() => handleAccept(inv.organization_id)}
                disabled={accepting === inv.organization_id}
                className="min-h-[44px] rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-opacity hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {accepting === inv.organization_id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Accept"
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
