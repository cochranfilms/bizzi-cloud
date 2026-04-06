import type { ShareFile } from "@/components/share/SharePreviewModal";

/** Path segments relative to the shared folder root (POSIX-ish; also tolerates backslashes). */
export function sharePathToSegments(relativePath: string): string[] {
  return relativePath.split(/[/\\]+/).filter(Boolean);
}

export function shareFileDirSegments(file: ShareFile): string[] {
  const parts = sharePathToSegments(file.path || file.name);
  if (parts.length <= 1) return [];
  return parts.slice(0, -1);
}

function dirStartsWith(dir: string[], prefix: string[]): boolean {
  if (prefix.length === 0) return true;
  if (dir.length < prefix.length) return false;
  return prefix.every((p, i) => dir[i] === p);
}

/** Files whose path lies under `prefix` (any depth), including files directly in nested folders. */
export function countShareFilesInSubtree(files: ShareFile[], prefix: string[]): number {
  let n = 0;
  for (const file of files) {
    const dir = shareFileDirSegments(file);
    if (dirStartsWith(dir, prefix)) n++;
  }
  return n;
}

export type ShareFolderChild = { name: string; itemCount: number };

/**
 * Lists immediate subfolders and files at `prefix` within the share (same semantics as a normal file browser).
 */
export function listShareFolderChildren(
  files: ShareFile[],
  prefix: string[],
): { subfolders: ShareFolderChild[]; filesHere: ShareFile[] } {
  const subfolderCounts = new Map<string, number>();
  const filesHere: ShareFile[] = [];

  for (const file of files) {
    const dir = shareFileDirSegments(file);
    if (!dirStartsWith(dir, prefix)) continue;

    const rest = dir.slice(prefix.length);
    if (rest.length === 0) {
      filesHere.push(file);
    } else {
      const top = rest[0]!;
      const nextPrefix = [...prefix, top];
      if (!subfolderCounts.has(top)) {
        subfolderCounts.set(top, countShareFilesInSubtree(files, nextPrefix));
      }
    }
  }

  const subfolders: ShareFolderChild[] = Array.from(subfolderCounts.entries()).map(([name, itemCount]) => ({
    name,
    itemCount,
  }));
  subfolders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  filesHere.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  return { subfolders, filesHere };
}
