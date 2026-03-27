/**
 * UI helpers: synthetic rows + hiding package members when showing one logical package.
 */

export type MacosPackageListEntry = {
  id: string;
  root_relative_path: string;
  root_segment_name?: string | null;
  display_label?: string | null;
  file_count: number;
  total_bytes: number;
  last_activity_at: string | null;
};

/** Same shape as RecentFile package rows (avoid importing hooks from lib). */
export type MacosPackageSyntheticFileRow = {
  id: string;
  name: string;
  path: string;
  objectKey: string;
  size: number;
  modifiedAt: string | null;
  driveId: string;
  driveName: string;
  assetType: string;
  macosPackageId: string;
  macosPackageFileCount: number;
  macosPackageLabel: string | null;
};

export function recentFileFromMacosPackageListEntry(
  pkg: MacosPackageListEntry,
  driveId: string,
  driveName: string
): MacosPackageSyntheticFileRow {
  const name =
    (pkg.root_segment_name as string) ||
    pkg.root_relative_path.split("/").filter(Boolean).pop() ||
    pkg.root_relative_path;
  return {
    id: `macos-pkg:${pkg.id}`,
    name,
    path: pkg.root_relative_path,
    objectKey: "",
    size: Number(pkg.total_bytes ?? 0),
    modifiedAt: pkg.last_activity_at,
    driveId,
    driveName,
    assetType: "macos_package",
    macosPackageId: pkg.id,
    macosPackageFileCount: pkg.file_count,
    macosPackageLabel: (pkg.display_label as string) ?? null,
  };
}

/** Expand synthetic `macos-pkg:*` selection to concrete `backup_files` ids for move/bulk download. */
export function expandMacosPackageRowIds(
  fileIds: string[],
  driveFiles: { id: string; path: string; macosPackageId?: string | null }[],
  packages: MacosPackageListEntry[]
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of fileIds) {
    if (!id.startsWith("macos-pkg:")) {
      if (!seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
      continue;
    }
    const pkgId = id.slice("macos-pkg:".length);
    const pkg = packages.find((p) => p.id === pkgId);
    const root = (pkg?.root_relative_path ?? "").replace(/^\/+/, "");
    const members = driveFiles.filter((f) => {
      if (f.macosPackageId === pkgId) return true;
      if (!root) return false;
      const p = f.path.replace(/^\/+/, "");
      return p === root || p.startsWith(`${root}/`);
    });
    for (const m of members) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        result.push(m.id);
      }
    }
  }
  return result;
}

/** One row per package + loose project files not under those package roots. */
export function mergeDriveFilesWithMacosPackages<T extends { path: string; macosPackageId?: string | null }>(
  displayedFiles: T[],
  packages: MacosPackageListEntry[],
  driveId: string,
  driveName: string
): (T | MacosPackageSyntheticFileRow)[] {
  const roots = new Set(packages.map((p) => p.root_relative_path.replace(/^\/+/, "")));
  const pkgIds = new Set(packages.map((p) => p.id));
  const filtered = displayedFiles.filter((f) => {
    if (f.macosPackageId && pkgIds.has(f.macosPackageId)) return false;
    const p = f.path.replace(/^\/+/, "");
    for (const r of roots) {
      if (!r) continue;
      if (p === r || p.startsWith(`${r}/`)) return false;
    }
    return true;
  });
  const synthetic = packages.map((pkg) =>
    recentFileFromMacosPackageListEntry(pkg, driveId, driveName)
  );
  return [...synthetic, ...filtered];
}
