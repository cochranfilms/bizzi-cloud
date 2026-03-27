"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getUserIdToken } from "@/lib/auth-token";
import { apiFileToRecentFile, type RecentFile } from "@/hooks/useCloudFiles";
import { usePathname } from "next/navigation";
import DashboardRouteFade from "./DashboardRouteFade";
import FileCard from "./FileCard";
import FileListRow from "./FileListRow";
import FilePreviewModal from "./FilePreviewModal";
import { useLayoutSettings } from "@/context/LayoutSettingsContext";
import {
  mergeDriveFilesWithMacosPackages,
  type MacosPackageListEntry,
} from "@/lib/macos-package-display";
import { Loader2 } from "lucide-react";

const MAX_PAGES = 15;

type ProjectsContext = "personal" | "enterprise" | "team";

function teamOwnerFromPath(pathname: string | null): string | null {
  const m = pathname ? /^\/team\/([^/]+)/.exec(pathname) : null;
  return m?.[1]?.trim() || null;
}

export default function ProjectsView({
  basePath = "/dashboard",
}: {
  basePath?: string;
}) {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const { linkedDrives } = useBackup();
  const pathname = usePathname();
  const {
    viewMode,
    cardSize,
    aspectRatio,
    thumbnailScale,
    showCardInfo,
  } = useLayoutSettings();

  const ctx: ProjectsContext = pathname?.startsWith("/enterprise")
    ? "enterprise"
    : teamOwnerFromPath(pathname ?? null)
      ? "team"
      : "personal";
  const teamOwnerUserId = teamOwnerFromPath(pathname ?? null);

  const [rows, setRows] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewFile, setPreviewFile] = useState<RecentFile | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await getUserIdToken(user, false);
      if (!token) {
        setRows([]);
        return;
      }
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const collected: RecentFile[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          sort: "newest",
          page_size: "50",
          creative_projects: "true",
        });
        if (cursor) params.set("cursor", cursor);
        if (ctx === "enterprise" && org?.id) {
          params.set("context", "enterprise");
          params.set("organization_id", org.id);
        } else if (ctx === "team" && teamOwnerUserId) {
          params.set("team_owner_id", teamOwnerUserId);
        }
        const res = await fetch(`${origin}/api/files/filter?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) break;
        const data = (await res.json()) as {
          files?: Record<string, unknown>[];
          cursor?: string | null;
          hasMore?: boolean;
        };
        const driveNameById = new Map(linkedDrives.map((d) => [d.id, d.name ?? "Folder"]));
        for (const raw of data.files ?? []) {
          collected.push(apiFileToRecentFile(raw, driveNameById));
        }
        if (!data.hasMore || !data.cursor) break;
        cursor = data.cursor;
      }

      const scopedDrives = linkedDrives.filter((d) => {
        if (ctx === "enterprise" && org?.id) return d.organization_id === org.id;
        if (ctx === "team" && teamOwnerUserId) {
          return d.user_id === teamOwnerUserId && !d.organization_id;
        }
        return !d.organization_id;
      });

      const byDrive = new Map<string, RecentFile[]>();
      for (const f of collected) {
        const arr = byDrive.get(f.driveId) ?? [];
        arr.push(f);
        byDrive.set(f.driveId, arr);
      }

      const merged: RecentFile[] = [];
      for (const drive of scopedDrives) {
        let packages: MacosPackageListEntry[] = [];
        try {
          const pr = await fetch(
            `${origin}/api/packages/list?drive_id=${encodeURIComponent(drive.id)}&folder_path=`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (pr.ok) {
            const pj = (await pr.json()) as { packages?: MacosPackageListEntry[] };
            packages = pj.packages ?? [];
          }
        } catch {
          /* ignore */
        }
        const driveFiles = byDrive.get(drive.id) ?? [];
        const part = mergeDriveFilesWithMacosPackages(
          driveFiles,
          packages,
          drive.id,
          drive.name ?? "Folder"
        );
        merged.push(...(part as RecentFile[]));
      }

      merged.sort((a, b) => {
        const ta = new Date(a.uploadedAt ?? a.modifiedAt ?? 0).getTime();
        const tb = new Date(b.uploadedAt ?? b.modifiedAt ?? 0).getTime();
        return tb - ta;
      });

      setRows(merged);
    } finally {
      setLoading(false);
    }
  }, [user, ctx, org?.id, teamOwnerUserId, linkedDrives]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <DashboardRouteFade ready={!loading} srOnlyMessage="Loading projects">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-neutral-500 dark:text-neutral-400">
            No creative project files yet. Upload a Premiere (.prproj), Final Cut library, Resolve export
            (.drp), or other project files to Storage — they will appear here for this workspace.
          </p>
        ) : viewMode === "list" ? (
          <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-700">
                  <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Name</th>
                  <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Type</th>
                  <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Size</th>
                  <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Modified</th>
                  <th className="px-4 py-3 font-medium text-neutral-900 dark:text-white">Folder</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((file) => (
                  <FileListRow
                    key={file.id}
                    file={file}
                    onClick={() =>
                      file.assetType === "macos_package" || file.id.startsWith("macos-pkg:")
                        ? undefined
                        : () => setPreviewFile(file)
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              viewMode === "thumbnail"
                ? "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                : cardSize === "small"
                  ? "sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6"
                  : cardSize === "large"
                    ? "sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
                    : "sm:grid-cols-3 md:grid-cols-4"
            }`}
          >
            {rows.map((file) => (
              <FileCard
                key={file.id}
                file={file}
                onClick={() =>
                  file.assetType === "macos_package" || file.id.startsWith("macos-pkg:")
                    ? undefined
                    : () => setPreviewFile(file)
                }
                layoutSize={viewMode === "thumbnail" ? "large" : cardSize}
                layoutAspectRatio={aspectRatio}
                thumbnailScale={thumbnailScale}
                showCardInfo={showCardInfo}
              />
            ))}
          </div>
        )}
      </DashboardRouteFade>

      {previewFile ? (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      ) : null}
    </>
  );
}
