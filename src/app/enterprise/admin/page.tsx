"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useRouter } from "next/navigation";
import { Shield, FolderOpen, User, LayoutGrid } from "lucide-react";
import { useFilteredFiles } from "@/hooks/useFilteredFiles";

type GroupBy = "drive" | "workspace" | "uploader" | "none";

export default function EnterpriseAdminPage() {
  const { user } = useAuth();
  const { org, role } = useEnterprise();
  const router = useRouter();
  const [groupBy, setGroupBy] = useState<GroupBy>("drive");

  useEffect(() => {
    if (!org || role !== "admin") {
      router.replace("/enterprise");
    }
  }, [org, role, router]);

  const { files, loading, totalCount } = useFilteredFiles({
    driveId: null,
    fallbackToCloudFiles: false,
  });

  if (!org || role !== "admin") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-neutral-500">Admin access required.</p>
      </div>
    );
  }

  const filesWithAdmin = files as Array<{
    id: string;
    name: string;
    driveName: string;
    driveId: string;
    modifiedAt: string | null;
    size: number;
    owner_user_id?: string | null;
    workspace_id?: string | null;
    visibility_scope?: string | null;
  }>;

  const grouped = (() => {
    if (groupBy === "none") return { "": filesWithAdmin };
    const map: Record<string, typeof filesWithAdmin> = {};
    for (const f of filesWithAdmin) {
      let key: string;
      if (groupBy === "drive") key = f.driveName || "Unknown";
      else if (groupBy === "workspace") key = f.workspace_id || "No workspace";
      else key = f.owner_user_id || "Unknown";
      if (!map[key]) map[key] = [];
      map[key].push(f);
    }
    return map;
  })();

  const groupKeys = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
              <Shield className="h-6 w-6 text-amber-600 dark:text-amber-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
                Organization Admin
              </h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                View all org files by drive, workspace, or uploader
              </p>
            </div>
          </div>
          <Link
            href="/enterprise/admin/workspaces"
            className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <LayoutGrid className="h-4 w-4" />
            Workspace Manager
          </Link>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="text-sm text-neutral-500">Group by:</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded border border-neutral-200 bg-transparent px-3 py-1.5 text-sm dark:border-neutral-600"
          >
            <option value="drive">Drive</option>
            <option value="workspace">Workspace</option>
            <option value="uploader">Uploader</option>
            <option value="none">None</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-neutral-500">Loading files...</p>
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-neutral-500">
            {totalCount} file{totalCount !== 1 ? "s" : ""} in organization
          </p>
          {groupKeys.map((key) => (
            <section key={key} className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
              {groupBy !== "none" && (
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  {groupBy === "drive" && <FolderOpen className="h-4 w-4" />}
                  {groupBy === "workspace" && <LayoutGrid className="h-4 w-4" />}
                  {groupBy === "uploader" && <User className="h-4 w-4" />}
                  {key}
                  <span className="text-neutral-500">
                    ({grouped[key].length} file{grouped[key].length !== 1 ? "s" : ""})
                  </span>
                </div>
              )}
              <ul className="space-y-2">
                {grouped[key].slice(0, 50).map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border border-neutral-100 px-3 py-2 dark:border-neutral-800"
                  >
                    <span className="truncate font-medium">{f.name}</span>
                    <div className="flex shrink-0 items-center gap-4 text-xs text-neutral-500">
                      <span>{f.driveName}</span>
                      {f.visibility_scope && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 dark:bg-neutral-800">
                          {f.visibility_scope}
                        </span>
                      )}
                      <span>{new Date(f.modifiedAt ?? 0).toLocaleDateString()}</span>
                    </div>
                  </li>
                ))}
              </ul>
              {grouped[key].length > 50 && (
                <p className="mt-2 text-xs text-neutral-500">
                  Showing 50 of {grouped[key].length}
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
