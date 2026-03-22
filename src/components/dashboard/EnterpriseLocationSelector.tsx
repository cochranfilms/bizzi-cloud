"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, FolderOpen, Film, Images, Loader2 } from "lucide-react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";
import { useBackup } from "@/context/BackupContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useRouter, useSearchParams } from "next/navigation";
import { filterDriveFoldersByPowerUp } from "@/lib/drive-powerup-filter";
import { getDisplayLabel, getVisibilityHelperText } from "@/lib/workspace-display-labels";
import { useCloudFiles } from "@/hooks/useCloudFiles";

type Scope = "private" | "shared" | "project" | "team";

interface WorkspaceOption {
  id: string;
  name: string;
  workspace_type: string;
  drive_id: string | null;
  drive_type: string | null;
}

export interface EnterpriseLocationSelectorProps {
  driveId: string;
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (id: string) => void;
  onSelectDrive?: (id: string, name: string) => void;
  className?: string;
}

function isSystemDrive(d: { name: string; isCreatorRaw?: boolean }) {
  return (
    d.name === "Storage" ||
    d.name === "Uploads" ||
    d.isCreatorRaw === true ||
    d.name === "Gallery Media"
  );
}

export function EnterpriseLocationSelector({
  driveId,
  selectedWorkspaceId,
  onSelectWorkspace,
  onSelectDrive,
  className = "",
}: EnterpriseLocationSelectorProps) {
  const { org } = useEnterprise();
  const { user } = useAuth();
  const { setCurrentDrive } = useCurrentFolder();
  const { linkedDrives } = useBackup();
  const { hasEditor, hasGallerySuite } = useSubscription();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { driveFolders } = useCloudFiles();
  const visibleDrives = filterDriveFoldersByPowerUp(driveFolders, {
    hasEditor,
    hasGallerySuite,
  });
  const systemDrives = visibleDrives.filter((d) =>
    isSystemDrive({ name: d.name, isCreatorRaw: d.isCreatorRaw })
  );

  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>("private");

  useEffect(() => {
    if (!org?.id || !user || !driveId) {
      setWorkspaces([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        if (cancelled) return;
        const res = await fetch(
          `/api/workspaces/list?organization_id=${encodeURIComponent(org.id)}&drive_id=${encodeURIComponent(driveId)}&mode=normal`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = res.ok ? (await res.json()) as { workspaces?: WorkspaceOption[] } : { workspaces: [] };
        if (!cancelled) {
          setWorkspaces(data.workspaces ?? []);
          const list = data.workspaces ?? [];
          const privateWs = list.find((w) => w.workspace_type === "private");
          const sharedWs = list.find((w) => w.workspace_type === "org_shared");
          const projectWs = list.find((w) => w.workspace_type === "project");
          const teamWs = list.find((w) => w.workspace_type === "team");
          const isValidSelection = selectedWorkspaceId && list.some((w) => w.id === selectedWorkspaceId);
          if ((!selectedWorkspaceId || !isValidSelection) && onSelectWorkspace) {
            const defaultId = privateWs?.id ?? sharedWs?.id ?? projectWs?.id ?? teamWs?.id ?? list[0]?.id;
            if (defaultId) onSelectWorkspace(defaultId);
          }
          if (selectedWorkspaceId && list.some((w) => w.id === selectedWorkspaceId)) {
            const sel = list.find((w) => w.id === selectedWorkspaceId);
            if (sel) {
              const s: Scope =
                sel.workspace_type === "private"
                  ? "private"
                  : sel.workspace_type === "org_shared"
                    ? "shared"
                    : sel.workspace_type === "project"
                      ? "project"
                      : sel.workspace_type === "team"
                        ? "team"
                        : "private";
              setScope(s);
            }
          } else if (privateWs) {
            setScope("private");
          } else if (sharedWs) {
            setScope("shared");
          } else if ((projectWs ?? teamWs)) {
            setScope(projectWs ? "project" : "team");
          }
        }
      } catch {
        if (!cancelled) setWorkspaces([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org?.id, driveId, user]);

  useEffect(() => {
    const sel = workspaces.find((w) => w.id === selectedWorkspaceId);
    if (sel) {
      const s: Scope =
        sel.workspace_type === "private"
          ? "private"
          : sel.workspace_type === "org_shared"
            ? "shared"
            : sel.workspace_type === "project"
              ? "project"
              : sel.workspace_type === "team"
                ? "team"
                : "private";
      setScope(s);
    }
  }, [selectedWorkspaceId, workspaces]);

  const privateWorkspaces = workspaces.filter((w) => w.workspace_type === "private");
  const sharedWorkspaces = workspaces.filter((w) => w.workspace_type === "org_shared");
  const projectWorkspaces = workspaces.filter((w) => w.workspace_type === "project");
  const teamWorkspaces = workspaces.filter((w) => w.workspace_type === "team");

  const destinationsForScope =
    scope === "private"
      ? privateWorkspaces
      : scope === "shared"
        ? sharedWorkspaces
        : scope === "project"
          ? projectWorkspaces
          : teamWorkspaces;

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const displayLabel = selectedWorkspace
    ? getDisplayLabel(selectedWorkspace, null)
    : "Select destination";
  const helperText = getVisibilityHelperText(
    selectedWorkspace?.workspace_type ?? "private",
    scope
  );

  const handleDriveClick = (id: string, name: string) => {
    setCurrentDrive(id);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("drive", id);
    router.replace(`/enterprise/files?${params.toString()}`, { scroll: false });
    onSelectDrive?.(id, name);
  };

  const scopeTabs: { id: Scope; label: string; count: number }[] = [
    { id: "private", label: "Private", count: privateWorkspaces.length },
    { id: "shared", label: "Shared", count: sharedWorkspaces.length },
    { id: "project", label: "Projects", count: projectWorkspaces.length },
    { id: "team", label: "Teams", count: teamWorkspaces.length },
  ];

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Current Drive */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
          Current drive
        </span>
        <div className="flex flex-wrap gap-1 rounded-lg border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900">
          {systemDrives.map((d) => {
            const isActive = d.id === driveId;
            const Icon =
              d.isCreatorRaw || d.name === "RAW"
                ? Film
                : d.name === "Gallery Media"
                  ? Images
                  : FolderOpen;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => handleDriveClick(d.id, d.name)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Icon className="h-4 w-4" />
                {d.name === "RAW" || d.isCreatorRaw ? "RAW" : d.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scope + Destination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-neutral-500" />
          <span className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
            Access scope
          </span>
          <div className="flex gap-0.5 rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-900">
            {scopeTabs.map((tab) => {
              const disabled = tab.count === 0;
              const active = scope === tab.id && !disabled;
              return (
                <button
                  key={tab.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setScope(tab.id);
                    const list =
                      tab.id === "private"
                        ? privateWorkspaces
                        : tab.id === "shared"
                          ? sharedWorkspaces
                          : tab.id === "project"
                            ? projectWorkspaces
                            : teamWorkspaces;
                    const first = list[0];
                    if (first) onSelectWorkspace(first.id);
                  }}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    disabled
                      ? "cursor-not-allowed text-neutral-400 dark:text-neutral-600"
                      : active
                        ? "bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                        : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  }`}
                >
                  {tab.label}
                  {tab.count === 0 && " (0)"}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 text-sm text-neutral-500">Destination</span>
          {loading ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
              <span className="text-sm text-neutral-500">Loading...</span>
            </div>
          ) : destinationsForScope.length === 0 ? (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
              <span className="text-sm text-neutral-500">
                {scope === "project"
                  ? "No project workspaces available"
                  : scope === "team"
                    ? "No team workspaces available"
                    : scope === "shared"
                      ? "No shared workspace available for this drive yet"
                      : "No private workspace"}
              </span>
            </div>
          ) : destinationsForScope.length === 1 ? (
            <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                {getDisplayLabel(destinationsForScope[0], null)}
              </span>
            </div>
          ) : (
            <select
              value={selectedWorkspaceId ?? ""}
              onChange={(e) => onSelectWorkspace(e.target.value)}
              className="min-w-[180px] rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
            >
              {destinationsForScope.map((w) => (
                <option key={w.id} value={w.id}>
                  {getDisplayLabel(w, null)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Helper text */}
      {selectedWorkspace && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{helperText}</p>
      )}
    </div>
  );
}
