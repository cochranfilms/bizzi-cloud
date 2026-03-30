"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Viewer-relative cap enforcement (e.g. seat effective for team members). */
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
  /** `undefined` until first successful load — avoids flashing free-tier cap before real quota. */
  const [quota, setQuota] = useState<number | null | undefined>(undefined);
  const [workspaceUsed, setWorkspaceUsed] = useState(0);
  const [reserved, setReserved] = useState(0);
  const [breakdown, setBreakdown] = useState<
    NonNullable<StorageStatusPayload["breakdown"]>
  >({});
  const [hydrated, setHydrated] = useState(false);
  const [teamFetchFailed, setTeamFetchFailed] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const { storageVersion } = useBackup();
  const { user } = useAuth();
  const pathname = usePathname();
  const teamOwnerFromPath =
    typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null : null;
  const prevTeamOwnerKeyRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (
      prevTeamOwnerKeyRef.current === teamOwnerFromPath &&
      prevTeamOwnerKeyRef.current !== undefined
    ) {
      return;
    }
    prevTeamOwnerKeyRef.current = teamOwnerFromPath;
    setHydrated(false);
    setTeamFetchFailed(false);
    setQuota(undefined);
    setBillableUsed(0);
    setWorkspaceUsed(0);
    setReserved(0);
    setBreakdown({});
  }, [teamOwnerFromPath]);

  const applyPayload = useCallback((data: StorageStatusPayload) => {
    const bill =
      typeof data.billable_used_bytes === "number"
        ? data.billable_used_bytes
        : (data._deprecated?.storage_used_bytes ?? 0);
    const explicitQuota = data.quota_bytes;
    let q: number | null;
    if (explicitQuota === null) {
      q = null;
    } else if (typeof explicitQuota === "number") {
      q = explicitQuota;
    } else {
      const dep = data._deprecated?.storage_quota_bytes;
      q = typeof dep === "number" ? dep : FREE_TIER_STORAGE_BYTES;
    }
    setBillableUsed(bill);
    setQuota(q);
    setWorkspaceUsed(
      typeof data.workspace_used_bytes === "number" ? data.workspace_used_bytes : bill
    );
    setReserved(typeof data.reserved_bytes === "number" ? data.reserved_bytes : 0);
    setBreakdown(data.breakdown ?? {});
    setHydrated(true);
    setTeamFetchFailed(false);
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
    try {
      const db = getFirebaseFirestore();
      const snap = await getDoc(doc(db, "profiles", user.uid));
      if (snap.exists()) {
        const d = snap.data();
        applyPayload({
          billable_used_bytes: d.storage_used_bytes ?? 0,
          quota_bytes:
            typeof d.storage_quota_bytes === "number"
              ? d.storage_quota_bytes
              : FREE_TIER_STORAGE_BYTES,
          workspace_used_bytes: d.storage_used_bytes ?? 0,
          reserved_bytes: 0,
          breakdown: {},
        });
        return;
      }
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
      const snap2 = await getDoc(doc(db, "profiles", user.uid));
      if (snap2.exists()) {
        const d = snap2.data();
        applyPayload({
          billable_used_bytes: d.storage_used_bytes ?? 0,
          quota_bytes:
            typeof d.storage_quota_bytes === "number"
              ? d.storage_quota_bytes
              : FREE_TIER_STORAGE_BYTES,
          workspace_used_bytes: d.storage_used_bytes ?? 0,
          reserved_bytes: 0,
          breakdown: {},
        });
      } else {
        applyPayload({
          billable_used_bytes: 0,
          quota_bytes: FREE_TIER_STORAGE_BYTES,
          workspace_used_bytes: 0,
          reserved_bytes: 0,
          breakdown: {},
        });
      }
    } catch {
      applyPayload({
        billable_used_bytes: 0,
        quota_bytes: FREE_TIER_STORAGE_BYTES,
        workspace_used_bytes: 0,
        reserved_bytes: 0,
        breakdown: {},
      });
    }
  }, [user, applyPayload]);

  const fetchTeamWorkspaceStorage = useCallback(async () => {
    if (!isFirebaseConfigured() || !user || !teamOwnerFromPath) return;
    setTeamFetchFailed(false);
    try {
      const token = await getFirebaseAuth().currentUser?.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(
        `${base}/api/storage/personal-team-workspace?team_owner_id=${encodeURIComponent(teamOwnerFromPath)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        setHydrated(true);
        setTeamFetchFailed(true);
        return;
      }
      applyPayload((await res.json()) as StorageStatusPayload);
    } catch {
      setHydrated(true);
      setTeamFetchFailed(true);
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
    if (!user) {
      prevTeamOwnerKeyRef.current = undefined;
      setHydrated(false);
      setTeamFetchFailed(false);
      setQuota(undefined);
      setBillableUsed(0);
      setWorkspaceUsed(0);
      setReserved(0);
      setBreakdown({});
    }
  }, [user]);

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

  const quotaLabel =
    quota === null
      ? teamOwnerFromPath
        ? "Unlimited (team pool)"
        : "Unlimited"
      : typeof quota === "number"
        ? formatBytes(quota)
        : null;
  const viewerIsTeamOwner =
    Boolean(user && teamOwnerFromPath && user.uid === teamOwnerFromPath);

  return (
    <div className="flex flex-col rounded-lg bg-neutral-100 px-3 py-3 dark:bg-neutral-800">
      <p className="text-xs text-neutral-600 dark:text-neutral-400">
        {teamOwnerFromPath ? "Team workspace files" : "Total plan usage (file-backed)"}
      </p>
      {!hydrated ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading storage…</p>
      ) : teamFetchFailed ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Couldn&apos;t load team storage. Try{" "}
          <button
            type="button"
            onClick={() => void fetchTeamWorkspaceStorage()}
            className="underline hover:text-neutral-900 dark:hover:text-neutral-200"
          >
            refresh
          </button>
          .
        </p>
      ) : (
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          {formatBytes(teamOwnerFromPath ? workspaceUsed : billableUsed)} of {quotaLabel ?? "—"}
          {!teamOwnerFromPath && reserved > 0 ? (
            <span className="font-normal text-neutral-500 dark:text-neutral-400">
              {" "}
              (+{formatBytes(reserved)} in-flight uploads)
            </span>
          ) : null}
        </p>
      )}
      {hydrated && !teamFetchFailed && !teamOwnerFromPath &&
        (breakdown.personal_solo_bytes !== undefined ||
          breakdown.hosted_team_container_bytes !== undefined) && (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Personal files: {formatBytes(breakdown.personal_solo_bytes ?? 0)} · Hosted team
            workspace: {formatBytes(breakdown.hosted_team_container_bytes ?? 0)}
          </p>
        )}
      {hydrated &&
        !teamFetchFailed &&
        teamOwnerFromPath &&
        (viewerIsTeamOwner ? (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            This team workspace uses storage from your plan ({formatBytes(billableUsed)} total
            billable on your account).
          </p>
        ) : (
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Your uploads in this workspace count toward the cap your team admin set. The
            team&apos;s plan has {formatBytes(billableUsed)} total billable (all members and the
            owner combined).
          </p>
        ))}
      <div className="pt-2">
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
