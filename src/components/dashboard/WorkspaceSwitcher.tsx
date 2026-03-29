"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, User, Building2, Users } from "lucide-react";
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
  membershipKind?: "owned" | "member";
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
  const [teamsSubOpen, setTeamsSubOpen] = useState(false);

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

  useEffect(() => {
    if (!open) setTeamsSubOpen(false);
  }, [open]);

  /** When 2+ personal teams (owned and/or member), collapse them under one "Teams" row + submenu. */
  const personalTeams = workspaces?.personalTeams ?? [];
  const useNestedTeamsMenu = personalTeams.length >= 2;

  const [supportsHover, setSupportsHover] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setSupportsHover(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  function renderPersonalTeamRow(
    t: PersonalTeamWs,
    opts?: { nested?: boolean; nestedIndent?: boolean }
  ) {
    const nested = opts?.nested ?? false;
    const indent = nested && (opts?.nestedIndent ?? true);
    const tp = getThemeById(t.theme).primary;
    const teamRowActive = activeTeamOwnerId === t.ownerUserId;
    return (
      <Link
        key={t.id}
        href={`/team/${t.ownerUserId}`}
        onClick={() => setOpen(false)}
        className={`flex items-center gap-2 py-2 text-sm transition-colors hover:bg-neutral-50 dark:hover:bg-white/10 ${
          indent ? "pl-8 pr-3" : "px-3"
        } ${teamRowActive ? "font-medium" : ""}`}
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
  }

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

  const workspacesReady = workspaces !== null;
  const entryCount = workspacesReady
    ? (workspaces.personal ? 1 : 0) +
      (workspaces.personalTeams?.length ?? 0) +
      (workspaces.organizations?.length ?? 0)
    : 0;
  const hasMultiple = workspacesReady && entryCount > 1;

  /**
   * Until `/api/account/workspaces` resolves, `entryCount` was 0 while `org` from EnterpriseContext
   * could already be set — the old `!hasMultiple` path briefly rendered the org name on `/dashboard`.
   * Only use compact single-target shortcuts after the workspace list is ready.
   */
  if (workspacesReady && !hasMultiple) {
    if (isEnterprise && org) {
      return (
        <Link
          href="/dashboard"
          className="max-w-[11rem] truncate rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-center text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 sm:max-w-[14rem] sm:px-3 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          title="Switch to personal workspace"
        >
          <span className="hidden sm:inline">Switch to Personal</span>
          <span className="sm:hidden">Personal</span>
        </Link>
      );
    }
    const orgInSwitcherList =
      org && workspaces.organizations?.some((o) => o.id === org.id);
    if (
      !isEnterprise &&
      orgInSwitcherList &&
      !workspaces.personal &&
      (workspaces.personalTeams?.length ?? 0) === 0
    ) {
      return (
        <Link
          href="/enterprise"
          className="max-w-[11rem] truncate rounded-lg border border-bizzi-blue/40 bg-bizzi-blue/10 px-2 py-1.5 text-xs font-medium text-bizzi-blue transition-colors hover:bg-bizzi-blue/20 sm:max-w-[14rem] sm:px-3 dark:border-bizzi-cyan/30 dark:bg-bizzi-blue/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/30"
          title={`Switch to ${org.name}`}
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
        className={`flex max-w-[10rem] shrink-0 items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-xs font-medium transition-colors hover:bg-neutral-50 sm:max-w-[12rem] sm:gap-1.5 sm:px-3 md:max-w-[15rem] dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800 ${
          triggerPrimary ? "" : "text-neutral-900 hover:text-neutral-900 dark:text-white dark:hover:text-white"
        }`}
        style={triggerPrimary ? { color: triggerPrimary } : undefined}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="min-w-0 flex-1 truncate text-left">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 max-w-[min(20rem,calc(100vw-1.5rem))] min-w-[200px] overflow-visible rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 max-sm:left-0 max-sm:right-0 max-sm:min-w-0 max-sm:max-w-none">
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
          {useNestedTeamsMenu ? (
            <div
              className="relative border-t border-neutral-100 dark:border-neutral-700/80"
              onMouseEnter={() => {
                if (supportsHover) setTeamsSubOpen(true);
              }}
              onMouseLeave={() => {
                if (supportsHover) setTeamsSubOpen(false);
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!supportsHover) setTeamsSubOpen((v) => !v);
                }}
                aria-expanded={teamsSubOpen}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-white/10 max-sm:min-h-[44px]"
              >
                <Users className="h-4 w-4 shrink-0 text-bizzi-blue dark:text-bizzi-cyan" />
                <span className="flex-1">Teams</span>
                <ChevronRight
                  className={`h-4 w-4 shrink-0 sm:opacity-70 max-sm:transition-transform ${
                    teamsSubOpen ? "max-sm:rotate-90" : ""
                  }`}
                />
              </button>
              {/* Mobile / coarse pointer: inline accordion */}
              <div
                className={`sm:hidden ${teamsSubOpen ? "block border-t border-neutral-100 dark:border-neutral-700/60" : "hidden"}`}
              >
                {personalTeams.map((t) =>
                  renderPersonalTeamRow(t, { nested: true, nestedIndent: true })
                )}
              </div>
              {/* Desktop / hover: flyout to the right (same wrapper keeps hover hit target) */}
              {teamsSubOpen && (
                <div className="hidden min-w-[14rem] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800 sm:absolute sm:left-full sm:top-0 sm:z-[110] sm:ml-0.5 sm:block sm:pl-0.5">
                  {personalTeams.map((t) =>
                    renderPersonalTeamRow(t, { nested: true, nestedIndent: false })
                  )}
                </div>
              )}
            </div>
          ) : (
            workspaces?.personalTeams?.map((t) => renderPersonalTeamRow(t))
          )}
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
