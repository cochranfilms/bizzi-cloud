"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useBackup } from "@/context/BackupContext";
import { useAuth } from "@/context/AuthContext";
import { getFirebaseAuth, getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { formatBytes } from "@/lib/analytics/format-bytes";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";

type StorageStatusPayload = {
  workspace_used_bytes?: number;
  billable_used_bytes?: number;
  reserved_bytes?: number;
  effective_billable_bytes_for_enforcement?: number;
  quota_bytes?: number | null;
  remaining_bytes?: number | null;
  breakdown?: {
    personal_solo_bytes?: number;
    hosted_team_container_bytes?: number;
    team_workspace_bytes?: number;
  };
  _deprecated?: {
    storage_used_bytes?: number;
    storage_quota_bytes?: number | null;
  };
};

export default function StorageBadge() {
  const [billableUsed, setBillableUsed] = useState(0);
  const [quota, setQuota] = useState<number | null>(FREE_TIER_STORAGE_BYTES);
  const [workspaceUsed, setWorkspaceUsed] = useState(0);
  const [reserved, setReserved] = useState(0);
  const [breakdown, setBreakdown] = useState<
    NonNullable<StorageStatusPayload["breakdown"]>
  >({});
  const [recalculating, setRecalculating] = useState(false);
  const { storageVersion } = useBackup();
  const { user } = useAuth();
  const pathname = usePathname();
  const teamOwnerFromPath =
    typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null : null;

  const applyPayload = useCallback((data: StorageStatusPayload) => {
    const bill =
      typeof data.billable_used_bytes === "number"
        ? data.billable_used_bytes
        : (data._deprecated?.storage_used_bytes ?? 0);
    const q =
      data.quota_bytes ?? data._deprecated?.storage_quota_bytes ?? FREE_TIER_STORAGE_BYTES;
    setBillableUsed(bill);
    setQuota(typeof q === "number" ? q : null);
    setWorkspaceUsed(
      typeof data.workspace_used_bytes === "number" ? data.workspace_used_bytes : bill
    );
    setReserved(typeof data.reserved_bytes === "number" ? data.reserved_bytes : 0);
    setBreakdown(data.breakdown ?? {});
  }, []);

  const fetchPersonalProfile = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      if (!token) return;
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/status?context=personal`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        applyPayload((await res.json()) as StorageStatusPayload);
        return;
      }
    } catch {
      // fall through to profile doc
    }
    const db = getFirebaseFirestore();
    const snap = await getDoc(doc(db, "profiles", user.uid));
    if (snap.exists()) {
      const d = snap.data();
      setBillableUsed(d.storage_used_bytes ?? 0);
      setQuota(
        typeof d.storage_quota_bytes === "number"
          ? d.storage_quota_bytes
          : FREE_TIER_STORAGE_BYTES
      );
      setWorkspaceUsed(d.storage_used_bytes ?? 0);
      setReserved(0);
      setBreakdown({});
    } else {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        const base = typeof window !== "undefined" ? window.location.origin : "";
        await fetch(`${base}/api/profile/ensure-free`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Ignore
      }
    }
  }, [user, applyPayload]);

  const fetchTeamWorkspaceStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user || !teamOwnerFromPath) return;
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage/personal-team-workspace?team_owner_id=${encodeURIComponent(teamOwnerFromPath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      applyPayload((await res.json()) as StorageStatusPayload);
    } catch {
      // keep previous values
    }
  }, [user, teamOwnerFromPath, applyPayload]);

  const refresh = useCallback(() => {
    if (teamOwnerFromPath) void fetchTeamWorkspaceStorage();
    else fetchPersonalProfile();
  }, [teamOwnerFromPath, fetchTeamWorkspaceStorage, fetchPersonalProfile]);

  useEffect(() => {
    refresh();
  }, [refresh, storageVersion]);

  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener("subscription-updated", handler);
    return () => window.removeEventListener("subscription-updated", handler);
  }, [refresh]);

  const recalculateStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user) return;
    if (teamOwnerFromPath) {
      setRecalculating(true);
      try {
        await fetchTeamWorkspaceStorage();
      } finally {
        setRecalculating(false);
      }
      return;
    }
    setRecalculating(true);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/recalculate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchPersonalProfile();
    } catch (err) {
      console.error("Recalculate storage:", err);
    } finally {
      setRecalculating(false);
    }
  }, [user, teamOwnerFromPath, fetchTeamWorkspaceStorage, fetchPersonalProfile]);

  const quotaLabel = quota === null ? "Unlimited" : formatBytes(quota);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col rounded-lg bg-neutral-100 px-3 py-3 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        {teamOwnerFromPath ? "Team workspace files" : "Total plan usage (file-backed)"}
      </p>
      <p className="text-sm font-medium text-neutral-900 dark:text-white">
        {formatBytes(teamOwnerFromPath ? workspaceUsed : billableUsed)} of {quotaLabel}
        {!teamOwnerFromPath && reserved > 0 ? (
          <span className="font-normal text-neutral-500 dark:text-neutral-400">
            {" "}
            (+{formatBytes(reserved)} in-flight uploads)
          </span>
        ) : null}
      </p>
      {!teamOwnerFromPath &&
        (breakdown.personal_solo_bytes !== undefined ||
          breakdown.hosted_team_container_bytes !== undefined) && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Personal files: {formatBytes(breakdown.personal_solo_bytes ?? 0)} · Hosted team
            workspace: {formatBytes(breakdown.hosted_team_container_bytes ?? 0)}
          </p>
        )}
      {teamOwnerFromPath && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          This folder counts toward the team owner&apos;s plan ({formatBytes(billableUsed)} total
          billable).
        </p>
      )}
      <details className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        <summary className="cursor-pointer select-none hover:text-neutral-700 dark:hover:text-neutral-300">
          Details
        </summary>
        <ul className="mt-1.5 list-inside list-disc space-y-0.5 pl-0.5">
          <li>Workspace slice: {formatBytes(workspaceUsed)}</li>
          <li>Billable (files): {formatBytes(billableUsed)}</li>
          <li>Reserved: {formatBytes(reserved)}</li>
          <li>Enforcement total: {formatBytes(billableUsed + reserved)}</li>
        </ul>
      </details>
      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={recalculateStorage}
          disabled={recalculating}
          className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300 disabled:opacity-50"
        >
          {recalculating ? "Updating…" : "Refresh storage"}
        </button>
      </div>
    </div>
  );
}
