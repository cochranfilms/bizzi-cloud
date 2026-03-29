"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2, ExternalLink, Loader2, Users } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { planAllowsPersonalTeamSeats } from "@/lib/pricing-data";
import {
  PERSONAL_TEAM_SEAT_ACCESS_LABELS,
  sumExtraTeamSeats,
  type PersonalTeamSeatAccess,
} from "@/lib/team-seat-pricing";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";

function formatStorageBrief(bytes: number): string {
  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) return `${(gb / 1024).toFixed(1)} TB`;
  return `${gb.toFixed(0)} GB`;
}

type MembershipApi = {
  seat_access_level: string;
  storage_quota_bytes: number | null;
  storage_used_bytes: number;
  team_admin_email: string | null;
};

export default function DashboardWorkspaceAccessSection() {
  const { user } = useAuth();
  const {
    planId,
    ownsPersonalTeam,
    teamSeatCounts,
    loading: subLoading,
  } = useSubscription();

  const allowsSeats = planAllowsPersonalTeamSeats(planId ?? "free");
  const isPersonalTeamOwner = ownsPersonalTeam && allowsSeats && !subLoading;

  const [hostedOwnerUid, setHostedOwnerUid] = useState<string | null | undefined>(undefined);
  const [ownerCardLoading, setOwnerCardLoading] = useState(false);
  const [ownerTeamName, setOwnerTeamName] = useState<string | null>(null);
  const [ownerLogoUrl, setOwnerLogoUrl] = useState<string | null>(null);
  const [ownerSeatsPurchased, setOwnerSeatsPurchased] = useState<number | null>(null);
  const [ownerSeatsInUse, setOwnerSeatsInUse] = useState<number | null>(null);
  const [ownerPlanStorage, setOwnerPlanStorage] = useState<string | null>(null);
  const [ownerTeamUsed, setOwnerTeamUsed] = useState<string | null>(null);

  const [memberLoading, setMemberLoading] = useState(false);
  const [memberTeamName, setMemberTeamName] = useState<string | null>(null);
  const [memberLogoUrl, setMemberLogoUrl] = useState<string | null>(null);
  const [memberRoleLabel, setMemberRoleLabel] = useState<string | null>(null);
  const [memberAccessLabel, setMemberAccessLabel] = useState<string | null>(null);
  const [memberAdminEmail, setMemberAdminEmail] = useState<string | null>(null);
  const [memberStorageLine, setMemberStorageLine] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured() || !user) {
      setHostedOwnerUid(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const db = getFirebaseFirestore();
        const snap = await getDoc(doc(db, "profiles", user.uid));
        const v = (snap.data()?.personal_team_owner_id as string | undefined)?.trim();
        if (!cancelled) setHostedOwnerUid(v && v.length > 0 ? v : null);
      } catch {
        if (!cancelled) setHostedOwnerUid(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadOwnerSummary = useCallback(async () => {
    if (!user || !isPersonalTeamOwner) return;
    setOwnerCardLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/personal-team/settings?owner_uid=${encodeURIComponent(user.uid)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = (await res.json()) as {
          team_name: string | null;
          logo_url: string | null;
        };
        setOwnerTeamName(data.team_name?.trim() || null);
        setOwnerLogoUrl(data.logo_url?.trim() || null);
      }
      const purchased = sumExtraTeamSeats(teamSeatCounts);
      setOwnerSeatsPurchased(purchased);
      if (purchased > 0) {
        const mr = await fetch("/api/personal-team/members", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (mr.ok) {
          const md = (await mr.json()) as {
            overview?: {
              used: Record<string, number>;
              team_quota_bytes?: number;
              team_used_bytes?: number;
            };
          };
          const u = md.overview?.used;
          if (u) {
            const inUse =
              (u.none ?? 0) + (u.gallery ?? 0) + (u.editor ?? 0) + (u.fullframe ?? 0);
            setOwnerSeatsInUse(inUse);
          } else {
            setOwnerSeatsInUse(null);
          }
          if (typeof md.overview?.team_quota_bytes === "number") {
            setOwnerPlanStorage(formatStorageBrief(md.overview.team_quota_bytes));
            setOwnerTeamUsed(formatStorageBrief(md.overview.team_used_bytes ?? 0));
          } else {
            setOwnerPlanStorage(null);
            setOwnerTeamUsed(null);
          }
        }
      } else {
        setOwnerSeatsInUse(null);
        setOwnerPlanStorage(null);
        setOwnerTeamUsed(null);
      }
    } finally {
      setOwnerCardLoading(false);
    }
  }, [user, isPersonalTeamOwner, teamSeatCounts]);

  useEffect(() => {
    void loadOwnerSummary();
  }, [loadOwnerSummary]);

  const loadMemberSummary = useCallback(async () => {
    if (!user || hostedOwnerUid == null || hostedOwnerUid === undefined) return;
    if (hostedOwnerUid === user.uid) return;
    setMemberLoading(true);
    try {
      const token = await user.getIdToken();
      const [setRes, memRes] = await Promise.all([
        fetch(
          `/api/personal-team/settings?owner_uid=${encodeURIComponent(hostedOwnerUid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(
          `/api/personal-team/my-membership?owner_uid=${encodeURIComponent(hostedOwnerUid)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
      ]);
      if (setRes.ok) {
        const sd = (await setRes.json()) as { team_name: string | null; logo_url: string | null };
        setMemberTeamName(sd.team_name?.trim() || "Team workspace");
        setMemberLogoUrl(sd.logo_url?.trim() || null);
      }
      if (memRes.ok) {
        const m = (await memRes.json()) as MembershipApi;
        const access =
          PERSONAL_TEAM_SEAT_ACCESS_LABELS[m.seat_access_level as PersonalTeamSeatAccess] ??
          m.seat_access_level;
        setMemberAccessLabel(access);
        setMemberRoleLabel("Member");
        setMemberAdminEmail(m.team_admin_email);
        if (m.storage_quota_bytes === null) {
          setMemberStorageLine(
            `Shared team pool · ${formatStorageBrief(m.storage_used_bytes)} used in team workspace`
          );
        } else {
          const cap = m.storage_quota_bytes;
          const used = m.storage_used_bytes;
          setMemberStorageLine(`${formatStorageBrief(used)} of ${formatStorageBrief(cap)} used`);
        }
      }
    } finally {
      setMemberLoading(false);
    }
  }, [user, hostedOwnerUid]);

  useEffect(() => {
    if (hostedOwnerUid && hostedOwnerUid !== user?.uid) {
      void loadMemberSummary();
    }
  }, [hostedOwnerUid, user?.uid, loadMemberSummary]);

  const adminHref =
    user && isPersonalTeamOwner ? `/team/${user.uid}/settings#team-management` : null;

  return (
    <div className="space-y-6">
      {isPersonalTeamOwner && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
            <Building2 className="h-5 w-5 text-bizzi-blue" />
            Workspace access
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Your personal team workspace — a quick summary. Members, invites, storage allocation, and
            lifecycle actions are handled in{" "}
            <strong className="text-neutral-800 dark:text-neutral-200">team administration</strong>.
          </p>

          {ownerCardLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin text-bizzi-blue" />
              Loading…
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                {ownerLogoUrl ? (
                  <Image
                    src={ownerLogoUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                    unoptimized
                  />
                ) : (
                  <Users className="h-8 w-8 text-bizzi-blue/50" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <p>
                  <span className="text-neutral-500 dark:text-neutral-400">Team</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {ownerTeamName || "—"}
                  </span>
                </p>
                <p>
                  <span className="text-neutral-500 dark:text-neutral-400">Your role</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">Owner</span>
                </p>
                <p>
                  <span className="text-neutral-500 dark:text-neutral-400">Extra team seats</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {ownerSeatsPurchased ?? 0} purchased
                    {ownerSeatsInUse != null && ownerSeatsPurchased != null && ownerSeatsPurchased > 0
                      ? ` · ${ownerSeatsInUse} in use · ${Math.max(0, ownerSeatsPurchased - ownerSeatsInUse)} available`
                      : null}
                  </span>
                </p>
                {ownerPlanStorage && (
                  <p>
                    <span className="text-neutral-500 dark:text-neutral-400">Plan storage</span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {ownerPlanStorage} on your plan
                      {ownerTeamUsed ? ` · ${ownerTeamUsed} used in team workspace` : null}
                    </span>
                  </p>
                )}
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Seat caps, invites, and pooled storage are managed in the team workspace admin area.
                </p>
              </div>
            </div>
          )}

          {adminHref && (
            <Link
              href={adminHref}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
            >
              Open team administration
              <ExternalLink className="h-4 w-4 opacity-90" />
            </Link>
          )}
        </section>
      )}

      {hostedOwnerUid && user && hostedOwnerUid !== user.uid && (
        <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
          <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
            <Building2 className="h-5 w-5 text-bizzi-blue" />
            Workspace access
          </h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            You are a member of someone else&apos;s personal team workspace. This is read only here —
            contact the workspace admin for seats or storage.
          </p>

          {memberLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 className="h-5 w-5 animate-spin text-bizzi-blue" />
              Loading…
            </div>
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                {memberLogoUrl ? (
                  <Image
                    src={memberLogoUrl}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                    unoptimized
                  />
                ) : (
                  <Building2 className="h-8 w-8 text-neutral-400" />
                )}
              </div>
              <ul className="min-w-0 flex-1 space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Team</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {memberTeamName ?? "—"}
                  </span>
                </li>
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Role</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {memberRoleLabel ?? "—"}
                  </span>
                </li>
                <li>
                  <span className="text-neutral-500 dark:text-neutral-400">Seat access</span>{" "}
                  <span className="font-medium text-neutral-900 dark:text-white">
                    {memberAccessLabel ?? "—"}
                  </span>
                </li>
                {memberStorageLine && (
                  <li>
                    <span className="text-neutral-500 dark:text-neutral-400">Your storage</span>{" "}
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {memberStorageLine}
                    </span>
                  </li>
                )}
                <li className="text-neutral-600 dark:text-neutral-400">
                  Workspace storage and seats are{" "}
                  <strong className="text-neutral-800 dark:text-neutral-200">managed by the team admin</strong>.
                </li>
                {memberAdminEmail && (
                  <li>
                    <span className="text-neutral-500 dark:text-neutral-400">Admin contact</span>{" "}
                    <a
                      href={`mailto:${memberAdminEmail}`}
                      className="font-medium text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                    >
                      {memberAdminEmail}
                    </a>
                  </li>
                )}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
