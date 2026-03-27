"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, User, Building2, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import {
  usePersonalTeamWorkspace,
  BIZZI_TEAM_WORKSPACE_UPDATED,
} from "@/context/PersonalTeamWorkspaceContext";
import { getThemeById } from "@/lib/enterprise-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";

interface Workspace {
  id: string;
  name: string;
  /** Organization: admin | member. Personal team: Admin | Member | tier label */
  role?: string;
  status: string;
  /** Set for organization workspaces (workspace switcher label color). */
  theme?: EnterpriseThemeId;
}

interface PersonalTeamWs {
  id: string;
  ownerUserId: string;
  name: string;
  role: string;
  status: string;
  theme: EnterpriseThemeId;
}

export default function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{
    personal: Workspace | null;
    personalTeams: PersonalTeamWs[];
    organizations: Workspace[];
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isEnterprise = pathname?.startsWith("/enterprise") ?? false;
  const teamPathMatch = typeof pathname === "string" ? /^\/team\/([^/]+)/.exec(pathname) : null;
  const activeTeamOwnerId = teamPathMatch?.[1] ?? null;
  const { user } = useAuth();
  const { org } = useEnterprise();
  const teamCtx = usePersonalTeamWorkspace();
  const [workspaceListVersion, setWorkspaceListVersion] = useState(0);

  useEffect(() => {
    const bump = () => setWorkspaceListVersion((v) => v + 1);
    window.addEventListener(BIZZI_TEAM_WORKSPACE_UPDATED, bump);
    return () => window.removeEventListener(BIZZI_TEAM_WORKSPACE_UPDATED, bump);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/workspaces", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWorkspaces({
            personal: data.personal,
            personalTeams: data.personalTeams ?? [],
            organizations: data.organizations ?? [],
          });
        }
      } catch {
        setWorkspaces({ personal: null, personalTeams: [], organizations: [] });
      }
    })();
  }, [user, workspaceListVersion]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const activeTeamName =
    activeTeamOwnerId &&
    (teamCtx?.teamOwnerUid === activeTeamOwnerId
      ? teamCtx.teamName
      : workspaces?.personalTeams?.find((t) => t.ownerUserId === activeTeamOwnerId)?.name);

  const currentLabel = isEnterprise
    ? org?.name ?? "Enterprise"
    : activeTeamOwnerId
      ? activeTeamName ?? "Team workspace"
      : workspaces?.personal?.name ?? "Personal Workspace";

  const entryCount =
    (workspaces?.personal ? 1 : 0) +
    (workspaces?.personalTeams?.length ?? 0) +
    (workspaces?.organizations?.length ?? 0);
  const hasMultiple = entryCount > 1;

  if (!hasMultiple) {
    if (isEnterprise && org) {
      return (
        <Link
          href="/dashboard"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          title="Switch to personal workspace"
        >
          Switch to Personal
        </Link>
      );
    }
    if (!isEnterprise && org) {
      return (
        <Link
          href="/enterprise"
          className="rounded-lg border border-bizzi-blue/40 bg-bizzi-blue/10 px-3 py-1.5 text-xs font-medium text-bizzi-blue transition-colors hover:bg-bizzi-blue/20 dark:border-bizzi-cyan/30 dark:bg-bizzi-blue/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/30"
          title="Switch to enterprise workspace"
        >
          {org.name}
        </Link>
      );
    }
    return null;
  }

  const isPersonalContext = !isEnterprise && !activeTeamOwnerId;

  const teamRowForActivePath = activeTeamOwnerId
    ? workspaces?.personalTeams?.find((x) => x.ownerUserId === activeTeamOwnerId)
    : undefined;
  const triggerPrimary =
    isEnterprise && org?.theme
      ? getThemeById(org.theme).primary
      : activeTeamOwnerId && teamCtx?.teamOwnerUid === activeTeamOwnerId
        ? getThemeById(teamCtx.teamThemeId).primary
        : teamRowForActivePath?.theme
          ? getThemeById(teamRowForActivePath.theme).primary
          : null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 ${
          triggerPrimary ? "" : "text-neutral-900 hover:text-neutral-900 dark:text-white dark:hover:text-white"
        }`}
        style={triggerPrimary ? { color: triggerPrimary } : undefined}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="truncate max-w-[120px]">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 min-w-[200px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {workspaces?.personal && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                isPersonalContext
                  ? "bg-neutral-100 font-medium dark:bg-neutral-700"
                  : "hover:bg-neutral-50 dark:hover:bg-white/10"
              }`}
            >
              <User className="h-4 w-4 flex-shrink-0 text-neutral-600 dark:text-neutral-300" />
              <span className="flex-1 truncate font-medium text-neutral-900 dark:text-white">
                {workspaces.personal.name}
              </span>
              {workspaces.personal.status !== "Active" && (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100">
                  {workspaces.personal.status}
                </span>
              )}
            </Link>
          )}
          {workspaces?.personalTeams?.map((t) => {
            const tp = getThemeById(t.theme).primary;
            const teamRowActive = activeTeamOwnerId === t.ownerUserId;
            return (
              <Link
                key={t.id}
                href={`/team/${t.ownerUserId}`}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-white/10 ${
                  teamRowActive ? "font-medium" : ""
                }`}
                style={{
                  color: tp,
                  ...(teamRowActive ? { backgroundColor: `${tp}26` } : {}),
                }}
              >
                <Users className="h-4 w-4 flex-shrink-0 opacity-90" style={{ color: tp }} />
                <span className="flex-1 truncate">{t.name}</span>
                {t.role === "Admin" ? (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${tp}40`, color: tp }}
                  >
                    Admin
                  </span>
                ) : (
                  <span className="max-w-[84px] truncate rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100">
                    {t.role}
                  </span>
                )}
              </Link>
            );
          })}
          {workspaces?.organizations?.map((orgWs) => {
            const op = getThemeById(orgWs.theme ?? "bizzi").primary;
            const orgRowActive = isEnterprise && org?.id === orgWs.id;
            return (
              <Link
                key={orgWs.id}
                href="/enterprise"
                onClick={() => {
                  setOpen(false);
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("bizzi-enterprise-org", orgWs.id);
                  }
                }}
                className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-white/10 ${
                  orgRowActive ? "font-medium" : ""
                }`}
                style={{
                  color: op,
                  ...(orgRowActive ? { backgroundColor: `${op}26` } : {}),
                }}
              >
                <Building2 className="h-4 w-4 flex-shrink-0 opacity-90" style={{ color: op }} />
                <span className="flex-1 truncate">{orgWs.name}</span>
                {orgWs.role === "admin" && (
                  <span
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${op}40`, color: op }}
                  >
                    Admin
                  </span>
                )}
                {orgWs.status !== "Active" && (
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs text-neutral-800 dark:bg-neutral-600 dark:text-neutral-100">
                    {orgWs.status}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
