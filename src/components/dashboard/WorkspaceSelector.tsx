"use client";

import { useEffect, useState } from "react";
import { LayoutGrid } from "lucide-react";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";

export interface WorkspaceOption {
  id: string;
  name: string;
  workspace_type: string;
  drive_id: string | null;
  drive_type: string | null;
}

interface WorkspaceSelectorProps {
  driveId?: string | null;
  selectedWorkspaceId?: string | null;
  onSelect?: (workspaceId: string) => void;
  className?: string;
}

/**
 * Shows workspaces for the current drive in org context.
 * When multiple exist, allows selection. Defaults to first (usually "My Private").
 */
export function WorkspaceSelector({
  driveId,
  selectedWorkspaceId,
  onSelect,
  className = "",
}: WorkspaceSelectorProps) {
  const { org } = useEnterprise();
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!org?.id || !user) {
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
          `/api/workspaces/list?organization_id=${encodeURIComponent(org.id)}${driveId ? `&drive_id=${encodeURIComponent(driveId)}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = res.ok ? await res.json() : { workspaces: [] };
        if (!cancelled) {
          setWorkspaces(data.workspaces ?? []);
          if (data.workspaces?.length > 0 && !selectedWorkspaceId && onSelect) {
            onSelect(data.workspaces[0].id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when org/drive/user changes
  }, [org?.id, driveId, user]);

  if (!org || workspaces.length === 0) return null;

  const selected = workspaces.find((w) => w.id === selectedWorkspaceId) ?? workspaces[0];

  if (workspaces.length === 1) {
    return (
      <div
        className={`flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 ${className}`}
      >
        <LayoutGrid className="h-4 w-4 text-neutral-500" />
        <span className="text-neutral-700 dark:text-neutral-300">{selected?.name ?? "My Private"}</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <LayoutGrid className="h-4 w-4 text-neutral-500" />
      <select
        value={selectedWorkspaceId ?? selected?.id ?? ""}
        onChange={(e) => onSelect?.(e.target.value)}
        className="rounded border border-neutral-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  );
}
