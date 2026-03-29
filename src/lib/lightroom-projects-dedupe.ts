/**
 * Projects list: one primary Lightroom row per library family when `.lrlibrary` and `.lrcat` both ingest.
 */
import type { RecentFile } from "@/hooks/useCloudFiles";

const LRLIB_SUFFIX = ".lrlibrary";

function normPath(p: string): string {
  return p.replace(/^\/+/, "").replace(/\.\./g, "");
}

function parentDir(relPath: string): string {
  const parts = normPath(relPath).split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join("/");
}

function lrlibraryStemFromPackageRow(file: RecentFile): string | null {
  if ((file.macosPackageKind ?? "").toLowerCase() !== "lrlibrary") return null;
  const path = normPath(file.path || file.name);
  const seg = path.split("/").filter(Boolean).pop() ?? "";
  const lower = seg.toLowerCase();
  if (!lower.endsWith(LRLIB_SUFFIX)) return null;
  return seg.slice(0, -LRLIB_SUFFIX.length);
}

function isLightroomLrcatRow(file: RecentFile): boolean {
  const pft = (file.projectFileType ?? "").toLowerCase();
  if (pft === "lightroom_lrcat") return true;
  const app = (file.creativeApp ?? "").toLowerCase();
  if ((app === "lightroom" || app === "lightroom_classic") && /\.lrcat$/i.test(file.name)) return true;
  return false;
}

/**
 * After macOS package merge: drop standalone `.lrcat` creative rows superseded by a sibling `.lrlibrary` package.
 */
export function dedupeLightroomFamilyProjectRows(rows: RecentFile[]): RecentFile[] {
  const lrlibraryRows = rows.filter(
    (f) =>
      (f.assetType === "macos_package" || f.id.startsWith("macos-pkg:")) &&
      (f.macosPackageKind ?? "").toLowerCase() === "lrlibrary"
  );
  if (lrlibraryRows.length === 0) return rows;

  const suppressIds = new Set<string>();
  for (const pkg of lrlibraryRows) {
    const root = normPath(pkg.path || pkg.name);
    const stem = lrlibraryStemFromPackageRow(pkg);
    const rootParent = parentDir(root);

    for (const f of rows) {
      if (f.id === pkg.id) continue;
      if (!isLightroomLrcatRow(f)) continue;
      const fp = normPath(f.path || f.name);
      if (fp.startsWith(`${root}/`)) {
        suppressIds.add(f.id);
        continue;
      }
      if (stem && parentDir(fp) === rootParent) {
        const base = fp.split("/").filter(Boolean).pop() ?? "";
        if (!/\.lrcat$/i.test(base)) continue;
        const catStem = base.slice(0, -".lrcat".length);
        if (catStem.toLowerCase() === stem.toLowerCase()) {
          suppressIds.add(f.id);
        }
      }
    }
  }

  return rows.filter((f) => !suppressIds.has(f.id));
}
