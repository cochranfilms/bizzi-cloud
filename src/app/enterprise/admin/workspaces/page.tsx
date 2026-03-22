"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useRouter } from "next/navigation";
import { Shield, LayoutGrid, FolderOpen, User, Loader2 } from "lucide-react";
import { getDisplayLabel } from "@/lib/workspace-display-labels";

type DriveFilter = "all" | "storage" | "raw" | "gallery";
type TypeFilter = "all" | "private" | "org_shared" | "team" | "project";

interface WorkspaceRow {
  id: string;
  name: string;
  workspace_type: string;
  drive_id: string | null;
  drive_type: string | null;
  created_by?: string;
  owner_display_name?: string | null;
}

export default function AdminWorkspacesPage() {
  const { user } = useAuth();
  const { org, role } = useEnterprise();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [driveFilter, setDriveFilter] = useState<DriveFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  useEffect(() => {
    if (!org || role !== "admin") {
      router.replace("/enterprise");
    }
  }, [org, role, router]);

  useEffect(() => {
    if (!org?.id || !user) {
      setWorkspaces([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        const params = new URLSearchParams({
          organization_id: org.id,
          mode: "admin",
        });
        const res = await fetch(`/api/workspaces/list?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? (await res.json()) as { workspaces?: WorkspaceRow[] } : { workspaces: [] };
        if (!cancelled) setWorkspaces(data.workspaces ?? []);
      } catch {
        if (!cancelled) setWorkspaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org?.id, user]);

  if (!org || role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-neutral-500">Admin access required.</p>
      </div>
    );
  }

  const filtered = workspaces.filter((w) => {
    if (driveFilter !== "all") {
      const dt = (w.drive_type ?? "storage") as string;
      if (driveFilter === "storage" && dt !== "storage") return false;
      if (driveFilter === "raw" && dt !== "raw") return false;
      if (driveFilter === "gallery" && dt !== "gallery") return false;
    }
    if (typeFilter !== "all" && w.workspace_type !== typeFilter) return false;
    return true;
  });

  const shared = filtered.filter((w) => w.workspace_type === "org_shared");
  const team = filtered.filter((w) => w.workspace_type === "team");
  const project = filtered.filter((w) => w.workspace_type === "project");
  const memberPrivate = filtered.filter((w) => w.workspace_type === "private");

  const renderWorkspaceRow = (w: WorkspaceRow) => {
    const displayName =
      w.workspace_type === "private" && w.owner_display_name
        ? getDisplayLabel(
            { name: w.name, workspace_type: w.workspace_type, drive_type: w.drive_type },
            w.owner_display_name
          )
        : getDisplayLabel(
            { name: w.name, workspace_type: w.workspace_type, drive_type: w.drive_type },
            null
          );
    const driveLabel =
      (w.drive_type ?? "storage") === "raw"
        ? "RAW"
        : (w.drive_type ?? "storage") === "gallery"
          ? "Gallery Media"
          : "Storage";
    return (
      <li
        key={w.id}
        className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 dark:border-neutral-800"
      >
        <span className="font-medium">{displayName}</span>
        <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
          <span>{driveLabel}</span>
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
            {w.workspace_type}
          </span>
          {w.owner_display_name && (
            <span className="text-neutral-600 dark:text-neutral-400">{w.owner_display_name}</span>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
            <LayoutGrid className="h-6 w-6 text-amber-600 dark:text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
              Organization Workspace Manager
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              View all workspaces across drives, types, and members
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={driveFilter}
            onChange={(e) => setDriveFilter(e.target.value as DriveFilter)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          >
            <option value="all">All drives</option>
            <option value="storage">Storage</option>
            <option value="raw">RAW</option>
            <option value="gallery">Gallery Media</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"
          >
            <option value="all">All types</option>
            <option value="private">Private</option>
            <option value="org_shared">Shared</option>
            <option value="team">Team</option>
            <option value="project">Project</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-neutral-500">
            {filtered.length} workspace{filtered.length !== 1 ? "s" : ""} in organization
          </p>

          {typeFilter === "all" || typeFilter === "org_shared" ? (
            shared.length > 0 && (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <FolderOpen className="h-4 w-4" />
                  Shared workspaces
                  <span className="text-neutral-500">({shared.length})</span>
                </div>
                <ul className="space-y-2">{shared.map(renderWorkspaceRow)}</ul>
              </section>
            )
          ) : null}

          {typeFilter === "all" || typeFilter === "team" ? (
            team.length > 0 && (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <LayoutGrid className="h-4 w-4" />
                  Team workspaces
                  <span className="text-neutral-500">({team.length})</span>
                </div>
                <ul className="space-y-2">{team.map(renderWorkspaceRow)}</ul>
              </section>
            )
          ) : null}

          {typeFilter === "all" || typeFilter === "project" ? (
            project.length > 0 && (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <LayoutGrid className="h-4 w-4" />
                  Project workspaces
                  <span className="text-neutral-500">({project.length})</span>
                </div>
                <ul className="space-y-2">{project.map(renderWorkspaceRow)}</ul>
              </section>
            )
          ) : null}

          {typeFilter === "all" || typeFilter === "private" ? (
            memberPrivate.length > 0 && (
              <section className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  <User className="h-4 w-4" />
                  Member private workspaces
                  <span className="text-neutral-500">({memberPrivate.length})</span>
                </div>
                <ul className="space-y-2">{memberPrivate.map(renderWorkspaceRow)}</ul>
              </section>
            )
          ) : null}

          {filtered.length === 0 && (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900">
              No workspaces match the current filters.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
